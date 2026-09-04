import { Route, Routes } from 'react-router-dom'
import VsmLayout from './pages/VsmLayout'
import SplashPage from './pages/SplashPage'
import MapListPage from './pages/MapListPage'
import LibraryPage from './pages/LibraryPage'
import AdminPage from './pages/AdminPage'
import MapLayout from './pages/MapLayout'
import MapEditorPage from './pages/MapEditorPage'
import BlufPage from './pages/BlufPage'

export default function App() {
  return (
    <Routes>
      {/* Top-level pages share the persistent VsmNav. */}
      <Route element={<VsmLayout />}>
        <Route path="/" element={<SplashPage />} />
        <Route path="/maps" element={<MapListPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      {/* MapLayout owns the chat panel + breadcrumb and stays mounted across this swap, so the
          chat pane (and its conversation) survives toggling between edit and BLUF. Its own
          toolbar replaces the top nav here to keep the canvas uncluttered. */}
      <Route path="/maps/:mapId" element={<MapLayout />}>
        <Route index element={<MapEditorPage />} />
        <Route path="bluf" element={<BlufPage />} />
      </Route>
    </Routes>
  )
}
