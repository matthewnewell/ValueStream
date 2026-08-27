import { Route, Routes } from 'react-router-dom'
import MapListPage from './pages/MapListPage'
import MapEditorPage from './pages/MapEditorPage'
import BlufPage from './pages/BlufPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapListPage />} />
      <Route path="/maps/:mapId" element={<MapEditorPage />} />
      <Route path="/maps/:mapId/bluf" element={<BlufPage />} />
    </Routes>
  )
}
