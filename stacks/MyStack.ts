import { StackContext, Table, WebSocketApi } from 'sst/constructs'
import { Function } from 'sst/constructs'

export function API({ stack }: StackContext) {
    const connectionTable = new Table(stack, 'Connections', {
        fields: {
            connectionId: 'string',
            peerUUID: 'string',
            connectionPayload: 'string',
            roomId: 'string',
            roomSize: 'number',
            isNarrowRoom: 'number',
            matchmade: 'number',
            expireAt: 'number',
        },
        timeToLiveAttribute: 'expireAt',
        cdk: {
            id: 'connectionsTable',
        },
        primaryIndex: { partitionKey: 'connectionId' },
    })

    const hello = new Function(stack, 'MyFunction', {
        handler: 'handlers/hello.main',
        bind: [connectionTable],
        permissions: ['execute-api'],
    })

    const api = new WebSocketApi(stack, 'Api', {
        defaults: {
            function: {
                timeout: 20,
                bind: [connectionTable, hello],
            },
        },
        routes: {
            $connect: 'handlers/webSocketConnect.main',
            $disconnect: 'handlers/webSocketDisconnect.main',
            $default: 'handlers/default.main',
        },
    })

    stack.addOutputs({
        ApiEndpoint: api.url,
    })
}
