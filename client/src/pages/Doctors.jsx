import { api } from '../api';
import { ErrorBox, Loading, useAsync } from '../ui';

export default function Doctors() {
  const { data, error, loading } = useAsync(() => api.doctors(), []);
  if (loading) return <Loading />;
  return (
    <>
      <div className="page-head"><div><h1>Doctors</h1><p>Profiles marked Demo are sample data for this installation.</p></div></div>
      <ErrorBox error={error} />
      <section className="panel divide">
        {data?.map((d) => (
          <div key={d.id} className="row wrap" style={{ padding: '16px 18px', alignItems: 'flex-start' }}>
            <div className="grow"><h2>{d.full_name} {d.is_demo ? <span className="pill pending" style={{ marginLeft: 6 }}>Demo</span> : null}</h2><div className="muted">{d.specialization}</div><div className="small faint" style={{ marginTop: 2 }}>{d.qualification}</div></div>
            <div className="small muted" style={{ minWidth: 220 }}>{d.hospital_clinic}<br />{d.experience_years} years of experience<br />Available {d.availability_schedule}</div>
          </div>))}
      </section>
    </>
  );
}
