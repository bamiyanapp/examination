import InterviewQuestions from './pages/InterviewQuestions.jsx'
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
      <InterviewQuestions />
    </>
  )
}

export default App
