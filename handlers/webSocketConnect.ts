import { DynamoDB, ApiGatewayManagementApi, Lambda } from 'aws-sdk'
import { WebSocketApiHandler } from 'sst/node/websocket-api'
import { Table } from 'sst/node/table'
import { Function } from 'sst/node/function'
import { v4 as uuidv4 } from 'uuid'

const dynamoDb = new DynamoDB.DocumentClient()

export const main = WebSocketApiHandler(async (event, _ctx) => {
    const init_lambda: string = Function.MyFunction.functionName
    const TableName: string = Table.Connections.tableName
    const connectionId = event.requestContext.connectionId
    const uuid = uuidv4()

    let roomId: string
    if (typeof event.queryStringParameters?.roomId === 'string') {
        roomId = event.queryStringParameters?.roomId
    } else {
        roomId = ''
    }

    let roomSize: number
    if (typeof event.queryStringParameters?.roomId === 'string') {
        roomSize = Number(event.queryStringParameters?.roomSize)
        if (Number.isNaN(roomId)) roomSize = 2
    } else {
        roomSize = 2
    }

    const connectionParams = {
        TableName,
        Item: {
            connectionId,
            peerUUID: uuid,
            roomId: roomId,
            roomSize: roomSize,
            expireAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        },
    }

    await dynamoDb.put(connectionParams).promise()

    const others = await dynamoDb
        .scan({
            TableName,
            ProjectionExpression: 'connectionId',
            FilterExpression: 'roomId = :roomid',
            //            FilterExpression: '(NOT XUserId = :mine) AND roomId = :roomid',
            // // Define the expression attribute value, which are substitutes for the values you want to compare.
            ExpressionAttributeValues: {
                //                ':mine': incomingUserId ,
                ':roomid': '',
            },
        })
        .promise()
    const { stage, domainName } = event.requestContext
    const apiG = new ApiGatewayManagementApi({
        endpoint: `${domainName}/${stage}`,
    })
    const initialConnectionId = connectionId
    const postToConnection = async function (attrs: Record<string, unknown>) {
        if (!('connectionId' in attrs) || typeof attrs.connectionId !== 'string')
            throw new Error('no connectionId')
        const connectionId = attrs.connectionId
        const is_self = connectionId === initialConnectionId
        if (is_self) return
        console.log('posting2', is_self)

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
    await Promise.all((others.Items ?? []).map(postToConnection))
    const lambdaClient = new Lambda()

    await lambdaClient
        .invoke({
            FunctionName: init_lambda,
            InvocationType: 'Event',
            Payload: JSON.stringify({
                stage,
                domain: domainName,
                uuid,
                connectionId: initialConnectionId,
            }),
        })
        .promise()
    const out = { statusCode: 200, body: 'Connected' }
    return out
})
