import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk'
import { WebSocketApiHandler } from 'sst/node/websocket-api'
import { Table } from 'sst/node/table'

const dynamoDb = new DynamoDB.DocumentClient()

export const main = WebSocketApiHandler(async (event, _ctx) => {
    const out = { statusCode: 200, body: 'ack' }
    if (!event.body) return out

    const body = JSON.parse(event.body)

    console.log(body)
    if (body === 'KeepAlive') return out
    const TableName: string = Table.Connections.tableName
    const connectionId = event.requestContext.connectionId
    let own_record_result = await dynamoDb.get({ TableName, Key: { connectionId } }).promise()
    if (!own_record_result.Item) throw new Error(`Failed to find own key ${connectionId}`)
    const own_record = own_record_result.Item
    if (!('roomId' in own_record) || typeof own_record.roomId !== 'string')
        throw new Error('no roomId')
    const own_room_id = own_record.roomId

    console.log('got own room id', own_room_id)
    const other_records = await dynamoDb
        .scan({
            TableName,
            ProjectionExpression: 'connectionId,peerUUID',
            FilterExpression: 'roomId = :roomid',
            //            FilterExpression: '(NOT XUserId = :mine) AND roomId = :roomid',
            // // Define the expression attribute value, which are substitutes for the values you want to compare.
            ExpressionAttributeValues: {
                //                ':mine': incomingUserId ,
                ':roomid': own_room_id,
            },
        })
        .promise()
    const { stage, domainName } = event.requestContext
    const apiG = new ApiGatewayManagementApi({
        endpoint: `${domainName}/${stage}`,
    })

    const mapped = (other_records.Items ?? []).map((attrs: Record<string, unknown>) => {
        if (!('connectionId' in attrs) || typeof attrs.connectionId !== 'string')
            throw new Error('no connectionId')
        if (!('peerUUID' in attrs) || typeof attrs.peerUUID !== 'string')
            throw new Error('no connectionId')
        const connectionId = attrs.connectionId
        const peerUUID = attrs.peerUUID
        return { connectionId, peerUUID }
    })

    const initialConnectionId = connectionId
    const myUUID = mapped.find((x) => x.connectionId === initialConnectionId)
    if (myUUID === undefined) {
        return { statusCode: 400, body: 'failed to find current connection in db' }
    }
    const postToConnection = async function ({
        connectionId,
    }: {
        connectionId: string
        peerUUID: string
    }) {
        if (connectionId === initialConnectionId) {
            return
        }
        try {
            await apiG
                .postToConnection({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({
                        Signal: { sender: myUUID.peerUUID, data: body.Signal.data },
                    }),
                })
                .promise()
        } catch (e) {
            if (typeof e === 'object' && e !== null && 'statusCode' in e && e.statusCode === 410) {
                // Remove stale connections
                await dynamoDb.delete({ TableName, Key: { connectionId } }).promise()
            } else {
                console.log('error', e)
                throw e
            }
        }
    }
    await Promise.all((mapped ?? []).map(postToConnection))
    return out
})
