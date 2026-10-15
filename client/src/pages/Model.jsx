import { api } from '../api';
import { ErrorBox, Loading, label, useAsync } from '../ui';

const CLASSES = ['Atelectasis', 'Consolidation', 'Infiltration', 'Pneumothorax', 'Edema', 'Emphysema', 'Fibrosis', 'Effusion', 'Pneumonia', 'Pleural_Thickening', 'Cardiomegaly', 'Nodule', 'Mass', 'Hernia'];
export default function Model() {
  const { data, error, loading } = useAsync(() => api.performance(), []);
  if (loading) return <Loading />;
  return (
    <>
      <div className="page-head"><div><h1>Model and data</h1><p>What the model is, what it was trained on, and what it cannot tell you.</p></div></div>
      <ErrorBox error={error} />
      <div className="stack" style={{ maxWidth: 980 }}>
        <section className="panel">
          <div className="hd"><h2>Model Architecture & Decision Support Guidelines</h2></div>
          <div className="bd stack" style={{ maxWidth: '72ch' }}>
            <p>Chest-X AI v2 incorporates the pretrained TorchXRayVision DenseNet-121 (<code>densenet121-res224-all</code>) multi-dataset model. Radiographs are normalized to 224 × 224 in [-1024, 1024] range with aspect-ratio-preserving center crops.</p>
            <p>The model outputs independent multi-label Sigmoid probabilities across 14 canonical NIH findings (plus 4 multi-dataset heads). Findings are ranked by their score relative to empirical operating thresholds (<code>op_threshs</code>) calibrated on hospital datasets.</p>
            <p>Operating thresholds are sensitivity decision-support operating points, not proof of pathology. Scores exceeding operating thresholds indicate findings warranting clinical review by a licensed radiologist.</p>
            <p className="faint small">Grad-CAM provides feature attribution heatmaps on <code>denseblock4</code> to highlight regions driving model score elevation. Grad-CAM visualizes network attention and does not constitute diagnostic proof.</p>
          </div>
        </section>
        {data.images.length > 0 && (
          <section className="panel">
            <div className="hd"><h2>Training ROC curves</h2><span className="small faint">From the original notebook run</span></div>
            <div className="bd form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              {data.images.map((i) => <figure key={i.file} style={{ margin: 0 }}><img src={`/results/${i.file}`} alt={i.title} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 4 }} /><figcaption className="small muted" style={{ marginTop: 6 }}>{i.title}</figcaption></figure>)}
            </div>
          </section>)}
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          <section className="panel"><div className="hd"><h2>Architecture</h2></div>
            <table><tbody>{data.architecture.map(([k, v]) => <tr key={k}><td style={{ width: 130 }}><b>{k}</b></td><td>{v}</td></tr>)}</tbody></table></section>
          <section className="panel"><div className="hd"><h2>The 14 findings</h2></div><div className="bd">{CLASSES.map((c) => <span className="chip" key={c} style={{ background: 'var(--paper-2)', color: 'var(--ink)', border: '1px solid var(--line)' }}>{label(c)}</span>)}</div></section>
        </div>
        <section className="panel"><div className="hd"><h2>Dataset citation</h2></div>
          <div className="bd small muted" style={{ maxWidth: '72ch' }}>Wang X, Peng Y, Lu L, Lu Z, Bagheri M, Summers RM. ChestX-ray8: Hospital-scale Chest X-ray Database and Benchmarks on Weakly-Supervised Classification and Localization of Common Thorax Diseases. IEEE CVPR, 2017, pp. 2097-2106.</div></section>
      </div>
    </>
  );
}
