import { ApiGatewayManagementApi } from 'aws-sdk'

type Event = {
    stage: string
    domain: string
    connectionId: string
    uuid: string
}

export const main = async (event: Event) => {
    await new Promise((resolve) => setTimeout(resolve, 100))

    const { stage, domain, connectionId, uuid } = event
    const apiG = new ApiGatewayManagementApi({
        endpoint: `${domain}/${stage}`,
    })

    await apiG
        .postToConnection({
            ConnectionId: connectionId,
            Data: JSON.stringify({ IdAssigned: uuid }),
        })
        .promise()

    return {}
}
