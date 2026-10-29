import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { fechaLarga } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Input } from '../components/ui'
import { Interruptor } from './ShowsAdmin'
import { Encabezado } from './AdminLayout'

const SEMANA = [
  { dia: 'Lunes', abre: '10:00', cierra: '20:00', activo: false },
  { dia: 'Martes', abre: '10:00', cierra: '20:00', activo: true },
  { dia: 'Miércoles', abre: '10:00', cierra: '20:00', activo: true },
  { dia: 'Jueves', abre: '10:00', cierra: '20:00', activo: true },
  { dia: 'Viernes', abre: '10:00', cierra: '22:00', activo: true },
  { dia: 'Sábado', abre: '09:00', cierra: '23:00', activo: true },
  { dia: 'Domingo', abre: '09:00', cierra: '21:00', activo: true },
]

export default function Disponibilidad() {
  const { bloqueos, setBloqueos, avisar } = useStore()
  const [semana, setSemana] = useState(SEMANA)
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')

  return (
    <>
      <Encabezado titulo="Horarios y bloqueos" descripcion="Define cuándo se puede reservar en línea" />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
          <h2 className="font-bold">Horario de servicio</h2>
          <ul className="mt-3 divide-y divide-linea">
            {semana.map((d, i) => (
              <li key={d.dia} className="flex flex-wrap items-center gap-3 py-3">
                <Interruptor activo={d.activo} etiqueta={`Dar servicio los ${d.dia.toLowerCase()}`} onCambio={() => setSemana(semana.map((x, j) => (j === i ? { ...x, activo: !x.activo } : x)))} />
                <span className="w-24 font-medium">{d.dia}</span>
                {d.activo ? (
                  <span className="flex items-center gap-2 text-sm">
                    <input type="time" defaultValue={d.abre} className="num h-9 rounded-lg border border-linea px-2" aria-label={`${d.dia} abre`} />
                    a
                    <input type="time" defaultValue={d.cierra} className="num h-9 rounded-lg border border-linea px-2" aria-label={`${d.dia} cierra`} />
                  </span>
                ) : (
                  <span className="text-sm text-tinta-soft">Sin servicio</span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Campo etiqueta="Anticipación mínima (horas)"><Input inputMode="numeric" defaultValue="48" /></Campo>
            <Campo etiqueta="Margen entre funciones (min)"><Input inputMode="numeric" defaultValue="60" /></Campo>
          </div>
          <Boton className="mt-4" onClick={() => avisar('Horario guardado')}>Guardar horario</Boton>
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
          <h2 className="font-bold">Fechas bloqueadas</h2>
          <p className="mt-1 text-sm text-tinta-soft">Vacaciones, mantenimiento o compromisos personales. No aparecen en el calendario del sitio.</p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              if (!fecha) return
              setBloqueos([...bloqueos, { fecha, motivo: motivo || 'Bloqueado' }].sort((a, b) => a.fecha.localeCompare(b.fecha)))
              avisar('Fecha bloqueada')
              setFecha('')
              setMotivo('')
            }}
          >
            <Campo etiqueta="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
            <Campo etiqueta="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Vacaciones" /></Campo>
            <Boton type="submit">Bloquear</Boton>
          </form>
          <ul className="mt-5 divide-y divide-linea">
            {bloqueos.map((b) => (
              <li key={b.fecha} className="flex items-center justify-between gap-3 py-3">
                <span>
                  <span className="block font-medium first-letter:uppercase">{fechaLarga(b.fecha)}</span>
                  <span className="block text-sm text-tinta-soft">{b.motivo}</span>
                </span>
                <button
                  onClick={() => {
                    setBloqueos(bloqueos.filter((x) => x.fecha !== b.fecha))
                    avisar('Bloqueo eliminado')
                  }}
                  className="rounded-full p-2 text-tinta-soft hover:bg-telon-50 hover:text-telon-700"
                  aria-label={`Quitar bloqueo del ${b.fecha}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
