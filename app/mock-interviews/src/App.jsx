import MockInterviews from './pages/MockInterviews.jsx'
import NavigationOverlay from './components/NavigationOverlay.jsx'
import BackToTop from './components/BackToTop.jsx'
import SpeculationRules from './components/SpeculationRules.jsx'

function App() {
  return (
    <>
      <SpeculationRules />
      <NavigationOverlay />
      <BackToTop />
      <MockInterviews />
    </>
  )
}

export default App
