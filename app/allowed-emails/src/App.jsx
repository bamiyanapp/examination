import AllowedEmails from './pages/AllowedEmails.jsx'
import NavigationOverlay from './components/NavigationOverlay.jsx'
import BackToTop from './components/BackToTop.jsx'
import SpeculationRules from './components/SpeculationRules.jsx'
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration.jsx'

function App() {
  return (
    <>
      <ServiceWorkerRegistration />
      <SpeculationRules />
      <NavigationOverlay />
      <BackToTop />
      <AllowedEmails />
    </>
  )
}

export default App
