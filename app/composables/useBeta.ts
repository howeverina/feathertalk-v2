// 지금 보고 있는 페이지가 베타(/beta…, /multi…)인지. 새 기능은 베타에서 먼저 켠다.
export function useBeta() {
  const p = useRoute().path
  return p.startsWith('/beta') || p.startsWith('/multi')
}

// 편집기/라이브 사이를 오갈 때 쓰는 주소 앞부분 ('' 또는 '/beta')
export function useBase() {
  return useRoute().path.startsWith('/beta') ? '/beta' : ''
}
