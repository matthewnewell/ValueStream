import { Route, Routes } from 'react-router-dom'
import MapListPage from './pages/MapListPage'
import MapEditorPage from './pages/MapEditorPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapListPage />} />
      <Route path="/maps/:mapId" element={<MapEditorPage />} />
    </Routes>
  )
}
