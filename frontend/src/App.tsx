import { Route, Routes } from 'react-router-dom'
import MapListPage from './pages/MapListPage'
import MapEditorPage from './pages/MapEditorPage'
import BlufPage from './pages/BlufPage'
import GuidePage from './pages/GuidePage'
import LibraryPage from './pages/LibraryPage'
import MapLayout from './pages/MapLayout'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapListPage />} />
      <Route path="/guide" element={<GuidePage />} />
      <Route path="/library" element={<LibraryPage />} />
      {/* MapLayout owns the chat panel + breadcrumb and stays mounted across this swap, so
          the chat pane (and its conversation) survives toggling between edit and BLUF. */}
      <Route path="/maps/:mapId" element={<MapLayout />}>
        <Route index element={<MapEditorPage />} />
        <Route path="bluf" element={<BlufPage />} />
      </Route>
    </Routes>
  )
}
