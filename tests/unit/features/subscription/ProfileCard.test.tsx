import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { ProfileCard } from '@features/subscription/ProfileCard';
import type { Entitlement } from '@services/entitlement/EntitlementService';

const FREE: Entitlement = {
  subscriptionTier: 'free',
  interpretationsUsedThisMonth: 7,
  monthlyInterpretationLimit: 10,
  imagesUsedThisMonth: 1,
  monthlyImageLimit: 1,
  bonusImageCredits: 0,
  resetDate: new Date('2026-09-01T00:00:00.000Z'),
  subscriptionExpiresAt: null,
};

const PREMIUM: Entitlement = {
  ...FREE,
  subscriptionTier: 'premium',
  monthlyInterpretationLimit: null,
  monthlyImageLimit: null,
};

function renderCard(overrides: Partial<React.ComponentProps<typeof ProfileCard>> = {}) {
  return render(
    <ProfileCard
      email="julien@morpheo.app"
      dreamCount={84}
      since={new Date('2026-02-11T00:00:00.000Z')}
      entitlement={FREE}
      onUpgrade={jest.fn()}
      {...overrides}
    />
  );
}

describe('ProfileCard', () => {
  it('shows who you are and how long you have been logging', () => {
    const { getByText } = renderCard();

    expect(getByText('julien@morpheo.app')).toBeTruthy();
    expect(getByText('84 dreams · since February 2026')).toBeTruthy();
  });

  it('falls back to a generic label when the account has no email (OAuth without one)', () => {
    const { getByText } = renderCard({ email: null });

    expect(getByText('Your account')).toBeTruthy();
  });

  it('drops the "since" clause when no dream has been logged yet', () => {
    const { getByText } = renderCard({ dreamCount: 0, since: null });

    expect(getByText('0 dreams')).toBeTruthy();
  });

  it('states what is left and what has been used, not just the tier', () => {
    const { getByText } = renderCard();

    expect(getByText('Free')).toBeTruthy();
    expect(getByText('3 interpretations left')).toBeTruthy();
    expect(getByText('7 / 10')).toBeTruthy();
  });

  it('keeps the meter out of the screen reader, since the line above already says it', () => {
    const { getByTestId } = renderCard();

    expect(getByTestId('quota-meter').props.accessible).toBe(false);
  });

  it('never reports a negative remainder when usage has overrun the limit', () => {
    const { getByText } = renderCard({
      entitlement: { ...FREE, interpretationsUsedThisMonth: 13 },
    });

    expect(getByText('0 interpretations left')).toBeTruthy();
  });

  it('replaces the meter with a plain statement on an unlimited tier', () => {
    const { getByText, queryByTestId } = renderCard({ entitlement: PREMIUM });

    expect(getByText('Premium')).toBeTruthy();
    expect(getByText('Unlimited interpretations and images')).toBeTruthy();
    // A bar that is always full would read as a warning rather than as "you have everything".
    expect(queryByTestId('quota-meter')).toBeNull();
  });

  it('shows unlimited for a premium tier even when the limit column is a stale non-null value', () => {
    // The RevenueCat webhook only ever writes subscription_tier; it never nulls out
    // monthly_interpretation_limit, so a premium row commonly still carries the
    // free-tier default (or a manually edited value). The meter must key off the
    // tier, not assume the limit column was cleared on upgrade.
    const { getByText, queryByTestId } = renderCard({
      entitlement: {
        ...PREMIUM,
        monthlyInterpretationLimit: 3,
        interpretationsUsedThisMonth: 3,
        monthlyImageLimit: 1,
        imagesUsedThisMonth: 1,
      },
    });

    expect(getByText('Unlimited interpretations and images')).toBeTruthy();
    expect(queryByTestId('quota-meter')).toBeNull();
    expect(queryByTestId('image-quota-meter')).toBeNull();
  });

  // Images are the scarcer quota since the repricing — one a month against three
  // interpretations — so leaving them off the card would make the tighter of the two
  // limits discoverable only by hitting it.
  it('meters images alongside interpretations', () => {
    const { getByText, getByTestId } = renderCard({
      entitlement: { ...FREE, monthlyImageLimit: 1, imagesUsedThisMonth: 0 },
    });

    expect(getByText('1 image left')).toBeTruthy();
    expect(getByText('0 / 1')).toBeTruthy();
    expect(getByTestId('image-quota-meter').props.accessible).toBe(false);
  });

  it('never reports a negative image remainder when usage has overrun the limit', () => {
    const { getByText } = renderCard({
      entitlement: { ...FREE, monthlyImageLimit: 1, imagesUsedThisMonth: 3 },
    });

    expect(getByText('0 images left')).toBeTruthy();
  });

  // The welcome image sits outside the monthly cycle, so it gets its own line rather than
  // being folded into the meter: adding it to the fraction would draw a bar that refills
  // once and never again.
  it('states the one-time welcome image separately from the monthly meter', () => {
    const { getByText } = renderCard({
      entitlement: { ...FREE, monthlyImageLimit: 1, imagesUsedThisMonth: 1, bonusImageCredits: 1 },
    });

    expect(getByText('0 images left')).toBeTruthy();
    expect(getByText('+ 1 welcome image, yours whenever you want it')).toBeTruthy();
  });

  it('drops the welcome line once the credit is spent', () => {
    const { queryByText } = renderCard({
      entitlement: { ...FREE, bonusImageCredits: 0 },
    });

    expect(queryByText(/welcome image/)).toBeNull();
  });

  it('offers the upgrade route from the quota line', () => {
    const onUpgrade = jest.fn();
    const { getByLabelText } = renderCard({ onUpgrade });

    fireEvent.press(getByLabelText('Go premium'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('renders without a meter or a reset date while the entitlement is still loading', () => {
    const { getByText, queryByTestId } = renderCard({ entitlement: null });

    // No entitlement means no known limit, so the card says nothing it cannot back up.
    expect(getByText('julien@morpheo.app')).toBeTruthy();
    expect(queryByTestId('quota-meter')).toBeNull();
    expect(queryByTestId('image-quota-meter')).toBeNull();
  });

  // Regression guard. A premium account whose entitlement fetch fails -- which is what a
  // column missing on the server looks like from inside the app, since PostgREST rejects
  // the whole select -- used to render the "Free" badge next to "Unlimited interpretations
  // and images". Telling a paying user they are on the free tier is worse than telling
  // them nothing, and the contradiction hid the actual fault.
  it('claims no tier at all when the entitlement is unknown', () => {
    const { queryByText } = renderCard({ entitlement: null });

    expect(queryByText('Free')).toBeNull();
    expect(queryByText('Premium')).toBeNull();
    expect(queryByText('Unlimited interpretations and images')).toBeNull();
  });

  // expire-subscriptions downgrades a lapsed subscriber's tier without zeroing the
  // counters, so someone who used 40 interpretations on premium lands mid-cycle on a
  // limit of 3. "40 / 3" reads as a rendering fault rather than as "you are over".
  it('reports a lowered limit as reached rather than printing a fraction above one', () => {
    const { getByText } = renderCard({
      entitlement: {
        ...FREE,
        subscriptionTier: 'free',
        monthlyInterpretationLimit: 3,
        interpretationsUsedThisMonth: 40,
      },
    });

    expect(getByText('0 interpretations left')).toBeTruthy();
    expect(getByText('3 / 3')).toBeTruthy();
  });
});
