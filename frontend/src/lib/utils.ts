import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Copies text to the clipboard and shows a toast.
 * navigator.clipboard only exists in secure contexts (HTTPS or localhost), and most
 * homelab installs are reached over plain HTTP on a LAN IP, so fall back to execCommand.
 */
export async function copyToClipboard(text: string, successMessage = 'Copied to clipboard'): Promise<boolean> {
  const { toast } = await import('sonner')
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (!ok) throw new Error('copy command rejected')
    }
    toast.success(successMessage)
    return true
  } catch {
    toast.error('Could not copy to clipboard')
    return false
  }
}
