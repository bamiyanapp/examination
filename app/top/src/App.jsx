import TopPage from './pages/TopPage.jsx'
import NavigationOverlay from './components/NavigationOverlay.jsx'
import SpeculationRules from './components/SpeculationRules.jsx'
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration.jsx'
import BackendCacheWarmer from './components/BackendCacheWarmer.jsx'

function App() {
  return (
    <>
      <ServiceWorkerRegistration />
      <BackendCacheWarmer />
      <SpeculationRules />
      <NavigationOverlay />
      <TopPage />
    </>
  )
}

export default App
