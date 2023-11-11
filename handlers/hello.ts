import { ApiGatewayManagementApi } from 'aws-sdk'

type Event = {
    stage: string
    domain: string
    connectionId: string
    uuid: string
}

export const main = async (event: Event) => {
    const { stage, domain, connectionId, uuid } = event
    const apiG = new ApiGatewayManagementApi({
        endpoint: `${domain}/${stage}`,
    })

    const max_retries = 3
    for (let retries = 1; retries <= max_retries; retries += 1) {
        try {
            await apiG
                .postToConnection({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({ IdAssigned: uuid }),
                })
                .promise()
            return { statusCode: 200 }
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
    return { statusCode: 400 }
}
