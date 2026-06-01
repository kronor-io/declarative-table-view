import type { ToastMessage } from 'primereact/toast'

export type ShowToastOptions = {
    severity: NonNullable<ToastMessage['severity']>
    summary?: ToastMessage['summary']
    detail?: ToastMessage['detail']
    content?: ToastMessage['content']
    life?: ToastMessage['life']
    sticky?: ToastMessage['sticky']
    closable?: ToastMessage['closable']
}

export type ShowToastFn = (opts: ShowToastOptions) => void

export const noopShowToast: ShowToastFn = () => {}
