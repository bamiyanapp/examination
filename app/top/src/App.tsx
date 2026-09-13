import TopPage from './pages/TopPage.tsx'
import AppShell from './components/AppShell.tsx'

function App() {
  return <AppShell page={<TopPage />} showBackToTop={false} />
}

export default App
