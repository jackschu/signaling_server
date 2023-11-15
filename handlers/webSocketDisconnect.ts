import { DynamoDB } from 'aws-sdk'
import { Table } from 'sst/node/table'
import { WebSocketApiHandler } from 'sst/node/websocket-api'
const dynamoDb = new DynamoDB.DocumentClient()

export const main = WebSocketApiHandler(async (event, _ctx) => {
    const TableName: string = Table.Connections.tableName
    const params = {
        TableName,
        ReturnValues: 'ALL_OLD',
        Key: {
            connectionId: event.requestContext.connectionId,
        },
    }

    const removed = await dynamoDb.delete(params).promise()
    if (!removed.Attributes) return { statusCode: 400, body: 'No item to remove' }
    const removed_room = removed.Attributes['roomId']
    if (removed_room === '') return { statusCode: 200, body: 'Disconnected' }
    const others = await dynamoDb
        .scan({
            TableName,
            ConsistentRead: true,
            ProjectionExpression: 'connectionId',
            FilterExpression: 'roomId = :roomid AND isNarrowRoom = :narrow',
            //            FilterExpression: '(NOT XUserId = :mine) AND roomId = :roomid',
            // // Define the expression attribute value, which are substitutes for the values you want to compare.
            ExpressionAttributeValues: {
                ':narrow': 0,
                ':roomid': removed_room,
            },
        })
        .promise()

    const postToConnection = async function (attrs: Record<string, unknown>) {
        if (!('connectionId' in attrs) || typeof attrs.connectionId !== 'string')
            throw new Error('no connectionId')
        const connectionId = attrs.connectionId

        try {
            await dynamoDb
                .delete({
                    TableName,
                    Key: { connectionId },
                }).promise()
            // await dynamoDb
            //     .update({
            //         Key: { connectionId },
            //         TableName,
            //         UpdateExpression: 'SET roomId = :empty, matchmade = :false',
            //         ExpressionAttributeValues: {
            //             ':empty': '',
            //             ':false': 0,
            //         },
            //     })
            //     .promise()
        } catch (e) {
            if (typeof e === 'object' && e !== null && 'statusCode' in e && e.statusCode === 410) {
                // Remove stale connections
                await dynamoDb.delete({ TableName, Key: { connectionId } }).promise()
            } else throw e
        }
    }
    await Promise.all((others.Items ?? []).map(postToConnection))

    return { statusCode: 200, body: 'Disconnected' }
})
