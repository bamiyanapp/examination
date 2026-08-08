import AllowedEmails from './pages/AllowedEmails.jsx'
import NavigationOverlay from './components/NavigationOverlay.jsx'
import BackToTop from './components/BackToTop.jsx'
import SpeculationRules from './components/SpeculationRules.jsx'
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration.jsx'
import BackendCacheWarmer from './components/BackendCacheWarmer.jsx'
import UpdateNotifier from './components/UpdateNotifier.jsx'
import UserMenu from './components/UserMenu.jsx'

function App() {
  return (
    <>
      <ServiceWorkerRegistration />
      <BackendCacheWarmer />
      <UpdateNotifier />
      <SpeculationRules />
      <NavigationOverlay />
      <UserMenu />
      <BackToTop />
      <AllowedEmails />
    </>
  )
}

export default App
