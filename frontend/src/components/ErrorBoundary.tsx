import { Component, ReactNode } from 'react'
export default class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="h-full grid place-items-center p-6">
        <div className="panel p-6 max-w-md text-center">
          <h1 className="text-lg font-semibold text-white">Something broke on this page</h1>
          <p className="text-sm text-slate-400 mt-2">{this.state.err.message}</p>
          <button className="btn-primary mt-4" onClick={() => { this.setState({ err: null }); window.location.href = '/' }}>Back to dashboard</button>
        </div>
      </div>
    )
  }
}
