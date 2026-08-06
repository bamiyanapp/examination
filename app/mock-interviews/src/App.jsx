import MockInterviews from './pages/MockInterviews.jsx'
import NavigationOverlay from './components/NavigationOverlay.jsx'
import BackToTop from './components/BackToTop.jsx'
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
      <BackToTop />
      <MockInterviews />
    </>
  )
}

export default App
