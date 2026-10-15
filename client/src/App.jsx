import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import HeroPage from './pages/HeroPage';
import Dashboard from './pages/Dashboard';
import NewStudy from './pages/NewStudy';
import Study from './pages/Study';
import { Patients, PatientDetail } from './pages/Patients';
import Compare from './pages/Compare';
import Appointments from './pages/Appointments';
import Doctors from './pages/Doctors';
import Assistant from './pages/Assistant';
import Model from './pages/Model';
import Admin from './pages/Admin';

const NAV = {
  DOCTOR: [['/', 'Worklist'], ['/new', 'New study'], ['/patients', 'Patients'], ['/compare', 'Compare'], ['/appointments', 'Appointments'], ['/assistant', 'Assistant'], ['/doctors', 'Doctors'], ['/model', 'Model & data']],
  ADMIN: [['/', 'Worklist'], ['/new', 'New study'], ['/patients', 'Patients'], ['/compare', 'Compare'], ['/appointments', 'Appointments'], ['/assistant', 'Assistant'], ['/doctors', 'Doctors'], ['/model', 'Model & data'], ['/admin', 'Administration']],
  PATIENT: [['/', 'My results'], ['/appointments', 'Appointments'], ['/doctors', 'Doctors'], ['/model', 'About the data']],
};

export default function App() {
  const { user, logout } = useAuth();
  const loc = useLocation();

  if (!user) {
    if (loc.pathname === '/login') return <Login />;
    // Show the 3D Animated Hero Page as the default landing experience for guests
    return <HeroPage />;
  }

  const staff = user.role !== 'PATIENT';
  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">Chest-X<small>Radiograph decision support</small></div>
        <nav aria-label="Main">{NAV[user.role].map(([to, t]) => <NavLink key={to} to={to} end={to === '/'}>{t}</NavLink>)}</nav>
        <div className="me"><b>{user.full_name}</b>{user.role === 'DOCTOR' ? 'Doctor' : user.role === 'ADMIN' ? 'Administrator' : 'Patient'}<br /><button onClick={logout}>Sign out</button></div>
      </aside>
      <div className="main">
        <div className="notice" role="note">AI output is a decision-support aid for research and education, not a diagnosis. A qualified clinician reviews every result.</div>
        <main className="page">
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/hero" element={<HeroPage />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/study/:id" element={<Study />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/doctors" element={<Doctors />} />
            <Route path="/model" element={<Model />} />
            {staff && <>
              <Route path="/new" element={<NewStudy />} />
              <Route path="/patients" element={<Patients />} />
              <Route path="/patients/:id" element={<PatientDetail />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/assistant" element={<Assistant />} />
            </>}
            {user.role === 'ADMIN' && <Route path="/admin" element={<Admin />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

