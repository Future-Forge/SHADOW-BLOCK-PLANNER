import { Component } from 'react';
import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';

/** A graphics failure must never take the planner/history interface down. */
export class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="map-failure" role="alert"><MapPin size={30} /><h3>The map could not initialize</h3><p>WebGL may be unavailable on this device. You can still explore trains, review blocks and use Planning Lab.</p><button className="secondary-button" onClick={() => this.setState({ failed: false })}>Retry map</button></div>;
  }
}
