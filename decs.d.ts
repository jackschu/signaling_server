declare module 'zoo-ids' {
    export function generateId(
        seed: unknown,
        settings: {
            numAdjectives?: number
            caseStyle: 'titlecase' | 'camelcase' | 'uppercase' | 'lowercase' | 'togglecase'
        }
    ): string
}
