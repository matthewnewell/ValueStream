import { Navigate, Route, Routes } from 'react-router-dom'
import VsmLayout from './pages/VsmLayout'
import SplashPage from './pages/SplashPage'
import SamplePage from './pages/SamplePage'
import LibraryPage from './pages/LibraryPage'
import AdminPage from './pages/AdminPage'
import MapLayout from './pages/MapLayout'
import MapEditorPage from './pages/MapEditorPage'
import TimelinePage from './pages/TimelinePage'

export default function App() {
  return (
    <Routes>
      {/* Top-level pages share the persistent VsmNav. */}
      <Route element={<VsmLayout />}>
        <Route path="/" element={<SplashPage />} />
        <Route path="/sample" element={<SamplePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/admin" element={<AdminPage />} />
        {/* The old global "Value Stream Maps" list is retired — working maps are managed from
            Admin, the library is where you browse and clone. Keep the URL alive. */}
        <Route path="/maps" element={<Navigate to="/library" replace />} />
      </Route>

      {/* MapLayout owns the chat panel + breadcrumb and stays mounted across this swap, so the
          chat pane (and its conversation) survives toggling between the Node and Timeline views. Its own
          toolbar replaces the top nav here to keep the canvas uncluttered. */}
      <Route path="/maps/:mapId" element={<MapLayout />}>
        <Route index element={<MapEditorPage />} />
        <Route path="timeline" element={<TimelinePage />} />
      </Route>
    </Routes>
  )
}
