export type ShowToastOptions = {
    severity: 'info' | 'success' | 'warn' | 'error'
    summary: string
    detail?: string
    life?: number
}

export type ShowToastFn = (opts: ShowToastOptions) => void

export const noopShowToast: ShowToastFn = () => {}
