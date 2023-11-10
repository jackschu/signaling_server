import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk'
import { WebSocketApiHandler } from 'sst/node/websocket-api'
import { Table } from 'sst/node/table'

type Event = {
    stage: string
    domain: string
    connectionId: string
    uuid: string
}

export const main = async (event: Event) => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const TableName: string = (Table as any).Connections.tableName

    const { stage, domain, connectionId, uuid } = event
    const apiG = new ApiGatewayManagementApi({
        endpoint: `${domain}/${stage}`,
    })

    console.log('posting from hello')
    await apiG
        .postToConnection({
            ConnectionId: connectionId,
            Data: JSON.stringify({ IdAssigned: uuid }),
        })
        .promise()

    return {}
}
