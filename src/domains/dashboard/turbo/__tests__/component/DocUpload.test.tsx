/* eslint-disable react/button-has-type */
import React from 'react';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import { vi, describe, it, beforeEach, expect } from 'vitest';

import DocUpload from '../../components/documents/DocUpload';

vi.mock('@components/atomic/inputs/DatePickerInput', () => ({
  default: () => <div data-testid="date-picker" />,
}));

vi.mock('../../components/documents/DocFileUpload', () => ({
  default: ({ setFileName }: any) => (
    <button
      data-testid="upload"
      onClick={() => setFileName('UploadedFile.pdf')}
    >
      Upload File
    </button>
  ),
}));

const showToastMock = vi.fn();
vi.mock('@src/slices/apiSlice', () => ({
  showToast: (...args: any) => showToastMock(...args),
}));

const mockStore = configureStore([]);

describe('DocUpload Component', () => {
  let store: any;
  const createDocMock = vi.fn();
  const deleteDocMock = vi.fn();

  beforeEach(() => {
    store = mockStore({});
    vi.clearAllMocks();
  });

  const setup = (existingData = null) =>
    render(
      <Provider store={store}>
        <DocUpload
          label="Fitness Cert"
          type="Fitness"
          existingData={existingData}
          vehicleId="123"
          createDoc={createDocMock}
          deteteDoc={deleteDocMock}
        />
      </Provider>
    );

  it('renders UI fields correctly', () => {
    setup();
    expect(screen.getByText('Fitness Cert')).toBeInTheDocument();
    expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    expect(screen.getByTestId('upload')).toBeInTheDocument();
  });

  it('calls createDoc and shows success toast', async () => {
    createDocMock.mockResolvedValue({ status: true, message: 'Uploaded' });

    setup();
    fireEvent.click(screen.getByText('Submit')); 

    await waitFor(() => {
      expect(createDocMock).toHaveBeenCalled();
      expect(showToastMock).toHaveBeenCalledWith({
        description: 'Uploaded ',
        variant: 'success',
      });
    });
  });

  it('calls createDoc and shows error toast', async () => {
    createDocMock.mockResolvedValue({ status: false, message: 'Error uploading' });

    setup();
    fireEvent.click(screen.getByText('Submit'));
    
    await waitFor(() => {
      expect(createDocMock).toHaveBeenCalled();
      expect(showToastMock).toHaveBeenCalledWith({
        description: 'Error uploading',
        variant: 'error',
      });
    });
  });

  
});
