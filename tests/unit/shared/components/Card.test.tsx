import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from '@shared/components/Card';

describe('Card', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <Card>
        <Text>Card content</Text>
      </Card>
    );
    expect(getByText('Card content')).toBeTruthy();
  });

  it('merges a custom style without crashing', () => {
    const { getByText } = render(
      <Card style={{ marginTop: 10 }}>
        <Text>Styled content</Text>
      </Card>
    );
    expect(getByText('Styled content')).toBeTruthy();
  });
});
