import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import configureStore from 'redux-mock-store';
import { describe, test, expect, vi, beforeEach } from 'vitest';

import ManageSubscription from '../../pages/ManageSubscription';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@src/hooks/store', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: any) =>
    selector({
      reducer: {
        auth: { role: 'admin', id: '12345' },
        user: { user: { firstName: 'John' } },
      },
    }),
}));

vi.mock('@src/routes/paths', () => ({
  paths: {
    plans: {
      index: 'plans',
      reviewOrder: 'review-order',
    },
  },
}));

vi.mock('@src/hooks/useScreenSize', () => ({
  default: () => ({ md: true }),
}));

vi.mock('../../hooks/useGetGarageUsage', () => ({
  default: () => ({
    details: { fleetsUsed: 2, driversUsed: 1 },
  }),
}));

vi.mock('@src/hooks/useSubscriptionAddons', () => ({
  default: () => ({
    addonData: {
      unitPrice: 1000,
      maxLimit: 10,
      packageId: 'pkg123',
    },
    isLoading: false,
    purchaseData: {
      currentSubscription: {
        package: { packageName: 'Turbo Basic' },
        billingType: 'monthly',
      },
      isGroupSubscription: false,
      addOns: {
        package: { packageName: 'Add-on Turbo Plus' },
      },
    },
  }),
}));

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Progress: () => <div data-testid="progress" />,
  };
});

const mockStore = configureStore([]);
let store: any;

beforeEach(() => {
  store = mockStore({});
  mockNavigate.mockClear();
});

describe('ManageSubscription Component', () => {
  test('renders heading', () => {
    render(
      <Provider store={store}>
        <BrowserRouter>
          <ManageSubscription />
        </BrowserRouter>
      </Provider>
    );
    expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
  });

  test('updates fleet count and total amount when input is typed', () => {
    render(
      <Provider store={store}>
        <BrowserRouter>
          <ManageSubscription />
        </BrowserRouter>
      </Provider>
    );

    const input = screen.getByPlaceholderText('Enter the Number');
    fireEvent.change(input, { target: { value: '3' } });

    expect(screen.getByText(/3,000/)).toBeInTheDocument();
  });

  test('navigates to review order page on Upgrade click', () => {
    render(
      <Provider store={store}>
        <BrowserRouter>
          <ManageSubscription />
        </BrowserRouter>
      </Provider>
    );

    const input = screen.getByPlaceholderText('Enter the Number');
    fireEvent.change(input, { target: { value: '2' } });

    const upgradeButton = screen.getByRole('button', { name: /upgrade/i });
    fireEvent.click(upgradeButton);

    expect(mockNavigate).toHaveBeenCalledWith('/plans/review-order');
  });
});
