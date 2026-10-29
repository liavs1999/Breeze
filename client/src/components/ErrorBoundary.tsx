import { Component, type ReactNode } from 'react';
import { Text } from '@mantine/core';

/** Contains a rendering failure to one message part: a broken chart never takes the chat down. */
export class PartBoundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`Could not render ${this.props.label}`, error);
  }

  render() {
    if (this.state.failed) {
      return (
        <Text size="sm" c="dimmed" className="card" p="md">
          This {this.props.label} could not be displayed.
        </Text>
      );
    }
    return this.props.children;
  }
}
