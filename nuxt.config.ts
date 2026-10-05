export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // WebGL, localStorage, 마이크를 쓰는 브라우저 전용 앱이라 SSR 없이 정적 SPA로 만든다
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/base.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'Feather-Talk',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        { name: 'description', content: '저사양 유저를 겨냥한 움직이는 버츄얼 캐릭터' },
        { property: 'og:image', content: '/assets/icon.png' },
        { property: 'og:title', content: 'Feather-Talk' },
        { property: 'og:description', content: '저사양 유저를 겨냥한 움직이는 버츄얼 캐릭터' },
      ],
      link: [{ rel: 'icon', type: 'image/png', href: '/assets/icon.png' }],
    },
  },

  nitro: {
    prerender: {
      routes: ['/', '/live'],
    },
  },
})
