import AllowedEmails from './pages/AllowedEmails.jsx'
import NavigationOverlay from './components/NavigationOverlay.jsx'
import BackToTop from './components/BackToTop.jsx'
import SpeculationRules from './components/SpeculationRules.jsx'

function App() {
  return (
    <>
      <SpeculationRules />
      <NavigationOverlay />
      <BackToTop />
      <AllowedEmails />
    </>
  )
}

export default App
