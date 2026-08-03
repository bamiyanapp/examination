import EducationOverview from './pages/EducationOverview.jsx'
import NavigationOverlay from './components/NavigationOverlay.jsx'
import BackToTop from './components/BackToTop.jsx'
import SpeculationRules from './components/SpeculationRules.jsx'

function App() {
  return (
    <>
      <SpeculationRules />
      <NavigationOverlay />
      <BackToTop />
      <EducationOverview />
    </>
  )
}

export default App
