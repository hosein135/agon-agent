export {}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Window {
    __pwaInit?: boolean
    __pwaDeferred?: BeforeInstallPromptEvent | null
  }

  interface Navigator {
    standalone?: boolean
  }

  interface ImportMeta {
    env?: Record<string, string | undefined>
  }
}
