import { Lambda } from 'aws-sdk'
import { Function } from 'sst/node/function'
import { v4 as uuidv4 } from 'uuid'
import { WebSocketApiHandler } from 'sst/node/websocket-api'

type Event = {
    stage: string
    domain: string
    roomId: string
    roomSize: number
    connectionId: string
    uuid: string
}

export const main = WebSocketApiHandler(async (event, _ctx) => {
    const init_lambda: string = Function.MyFunction.functionName
    const { stage, domainName } = event.requestContext

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

    const connectionId = event.requestContext.connectionId
    const uuid = uuidv4()

    const lambdaClient = new Lambda()

    const payload: Event = {
        stage,
        domain: domainName,
        roomId,
        uuid,
        connectionId,
        roomSize,
    }
    await lambdaClient
        .invoke({
            FunctionName: init_lambda,
            InvocationType: 'Event',
            Payload: JSON.stringify(payload),
        })
        .promise()
    const out = { statusCode: 200, body: 'Connected' }
    return out
})
