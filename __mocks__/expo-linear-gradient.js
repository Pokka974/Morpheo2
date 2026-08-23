// expo-linear-gradient renders through a native view manager that jest-expo does not
// register, so importing the real module throws on `viewManagersMetadata`. The mock
// renders a plain View and keeps the gradient props on it, so tests can still assert
// on layout and on which gradient a component chose.
const React = require('react');
const { View } = require('react-native');

function LinearGradient({ children, ...props }) {
  return React.createElement(View, { ...props, testID: props.testID ?? 'linear-gradient' }, children);
}

module.exports = { LinearGradient, default: LinearGradient };
