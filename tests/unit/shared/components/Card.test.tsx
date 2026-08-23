import React from 'react';
import { StyleSheet } from 'react-native';
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
    const extraStyle = StyleSheet.create({ spaced: { marginTop: 10 } });
    const { getByText } = render(
      <Card style={extraStyle.spaced}>
        <Text>Styled content</Text>
      </Card>
    );
    expect(getByText('Styled content')).toBeTruthy();
  });
});
