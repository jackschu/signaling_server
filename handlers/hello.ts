import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk'
import { Table } from 'sst/node/table'
import { generateId } from 'zoo-ids'

type Event = {
    stage: string
    domain: string
    roomId: string
    roomSize: number
    connectionId: string
    uuid: string
}

const dynamoDb = new DynamoDB.DocumentClient()

const initialize_id = async (
    apiG: ApiGatewayManagementApi,
    connectionId: string,
    uuid: string
): Promise<boolean> => {
    const max_retries = 3
    for (let retries = 1; retries <= max_retries; retries += 1) {
        try {
            await apiG
                .postToConnection({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({ IdAssigned: uuid }),
                })
                .promise()
            return true
        } catch (e) {
            if (typeof e === 'object' && e !== null && 'statusCode' in e && e.statusCode === 410) {
                await new Promise((resolve) => setTimeout(resolve, 50))
                console.log(
                    `Failed to find connection to ack with initial id ${connectionId} retrying: ${retries}/${
                        max_retries - 1
                    }`
                )
            } else {
                console.log('error', e)
                throw e
            }
        }
    }
    return false
}

export const main = async (event: Event) => {
    let { stage, domain, connectionId, uuid, roomId, roomSize } = event
    const initialConnectionId = connectionId
    const apiG = new ApiGatewayManagementApi({
        endpoint: `${domain}/${stage}`,
    })

    const TableName: string = Table.Connections.tableName
    const successful_init = await initialize_id(apiG, connectionId, uuid)
    if (!successful_init) return { statusCode: 400 }
    let isNarrowRoom = 1
    if (roomId === '') {
        isNarrowRoom = 0
    }
    const connectionParams = {
        TableName,
        Item: {
            connectionId,
            isNarrowRoom,
            peerUUID: uuid,
            roomId: roomId,
            matchmade: 0,
            roomSize: roomSize,
            expireAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        },
    }

    await dynamoDb.put(connectionParams).promise()

    const others = await dynamoDb
        .scan({
            TableName,
            ConsistentRead: true,
            ProjectionExpression: 'connectionId, roomId, roomSize, expireAt',
            FilterExpression: '(roomId = :roomid OR roomId = :empty) AND matchmade = :false',
            //            FilterExpression: '(NOT XUserId = :mine) AND roomId = :roomid',
            // // Define the expression attribute value, which are substitutes for the values you want to compare.
            ExpressionAttributeValues: {
                ':roomid': roomId,
                ':empty': '',
                ':false': 0,
            },
        })
        .promise()

    type Record = {
        connectionId: string
        roomId: string
        expireAt: number
    }
    const other_records: Record[] = (others.Items ?? [])
        .map((attrs) => {
            if (!('connectionId' in attrs) || typeof attrs.connectionId !== 'string')
                throw new Error('no connectionId')
            if (!('roomId' in attrs) || typeof attrs.roomId !== 'string')
                throw new Error('no roomId')
            if (!('expireAt' in attrs) || typeof attrs.expireAt !== 'number')
                throw new Error('no expireAt')
            return {
                connectionId: attrs.connectionId,
                roomId: attrs.roomId,
                expireAt: attrs.expireAt,
            }
        })
        .sort((a, b) => {
            if (a.connectionId === initialConnectionId) {
                return -1
            }
            if (b.connectionId === initialConnectionId) {
                return 1
            }
            if (a.roomId !== '' && b.roomId === '') {
                return -1
            }
            if (b.roomId !== '' && a.roomId === '') {
                return 1
            }
            return a.expireAt - b.expireAt
        })
        .slice(0, roomSize)

    const is_matchmade = roomSize === other_records.length
    const candidateRoomId = generateId(connectionId, { caseStyle: 'titlecase' })

    const postToConnection = async function (attrs: Record) {
        if (!('connectionId' in attrs) || typeof attrs.connectionId !== 'string')
            throw new Error('no connectionId')
        const connectionId = attrs.connectionId
        const is_self = connectionId === initialConnectionId
        if (is_matchmade)
            await dynamoDb
                .update({
                    Key: { connectionId },
                    TableName,
                    UpdateExpression: 'SET roomId = :roomId, matchmade = :true',
                    ExpressionAttributeValues: {
                        ':roomId': candidateRoomId,
                        ':true': 1,
                    },
                })
                .promise()
        if (is_self) return

        try {
            // Send the message to the given client
            await apiG
                .postToConnection({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({ NewPeer: uuid }),
                })
                .promise()
        } catch (e) {
            console.log(e, is_self)
            if (typeof e === 'object' && e !== null && 'statusCode' in e && e.statusCode === 410) {
                // Remove stale connections
                await dynamoDb.delete({ TableName, Key: { connectionId } }).promise()
            } else throw e
        }
    }

    // // Iterate through all the connections
    await Promise.all(other_records.map(postToConnection))
    return { statusCode: 200 }
}
