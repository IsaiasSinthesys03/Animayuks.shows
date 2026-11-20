// El dominio muestra solo la página de Santa Memoria (la app React se compila con `npm run build:app`).
import { cpSync, rmSync } from 'node:fs'
rmSync('dist', { recursive: true, force: true })
cpSync('santa-memoria', 'dist', { recursive: true })
console.log('dist/ = Santa Memoria')
