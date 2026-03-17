import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import axios from 'axios';
import { createChannelsRouter } from './channels';
import { SQLiteStore } from '../services/sqliteStore';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock the modelsDevFetcher module
vi.mock('../services/modelsDevFetcher.js', () => ({
  fetchAllModelsDevPrices: vi.fn(),
}));

describe('GET /api/channels/:id/available-models', () => {
  let router: ReturnType<typeof createChannelsRouter>;
  let mockStore: SQLiteStore;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockStore = new SQLiteStore(':memory:');
    router = createChannelsRouter(mockStore);
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    
    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 for invalid channel ID', async () => {
    mockRequest = {
      params: { id: 'invalid' },
      query: { targetUrl: 'https://api.example.com', apiKey: 'test-key' },
    };

    // Find the route handler
    const routes = (router as any).stack;
    const getRoute = routes.find((r: any) => 
      r.route?.path === '/:id/available-models' && r.route?.methods?.get
    );

    await getRoute.route.stack[0].handle(mockRequest, mockResponse);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid channel ID',
    });
  });

  it('should return 400 for missing query parameters', async () => {
    mockRequest = {
      params: { id: '1' },
      query: {},
    };

    const routes = (router as any).stack;
    const getRoute = routes.find((r: any) => 
      r.route?.path === '/:id/available-models' && r.route?.methods?.get
    );

    await getRoute.route.stack[0].handle(mockRequest, mockResponse);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: 'Missing required query parameters: targetUrl, apiKey',
    });
  });

  it('should return 404 for non-existent channel', async () => {
    mockRequest = {
      params: { id: '999' },
      query: { targetUrl: 'https://api.example.com', apiKey: 'test-key' },
    };

    // Mock axios to return 404
    const axiosError = new Error('Not found');
    Object.assign(axiosError, {
      isAxiosError: true,
      response: { status: 404 },
    });
    
    mockedAxios.get.mockRejectedValueOnce(axiosError);
    mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

    const routes = (router as any).stack;
    const getRoute = routes.find((r: any) => 
      r.route?.path === '/:id/available-models' && r.route?.methods?.get
    );

    await getRoute.route.stack[0].handle(mockRequest, mockResponse);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: 'Channel not found: 999',
    });
  });

  it('should return available models filtered by channel', async () => {
    mockRequest = {
      params: { id: '1' },
      query: { targetUrl: 'https://api.example.com', apiKey: 'test-key' },
    };

    // Mock channel response with existing models
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          id: 1,
          name: 'Test Channel',
          type: 1,
          models: 'gpt-4o,claude-3-opus',
          model_mapping: '',
          status: 1,
          priority: 0,
        },
      },
    });

    // Mock models.dev prices
    const { fetchAllModelsDevPrices } = await import('../services/modelsDevFetcher.js');
    vi.mocked(fetchAllModelsDevPrices).mockResolvedValueOnce([
      {
        provider: 'OpenAI',
        success: true,
        models: [
          {
            modelId: 'gpt-4o',
            modelName: 'GPT-4 Optimized',
            provider: 'OpenAI',
            inputPricePerMillion: 5.0,
            outputPricePerMillion: 15.0,
          },
          {
            modelId: 'gpt-3.5-turbo',
            modelName: 'GPT-3.5 Turbo',
            provider: 'OpenAI',
            inputPricePerMillion: 0.5,
            outputPricePerMillion: 1.5,
          },
        ],
        fetchedAt: new Date().toISOString(),
      },
      {
        provider: 'Anthropic',
        success: true,
        models: [
          {
            modelId: 'claude-3-opus',
            modelName: 'Claude 3 Opus',
            provider: 'Anthropic',
            inputPricePerMillion: 15.0,
            outputPricePerMillion: 75.0,
          },
          {
            modelId: 'claude-3-sonnet',
            modelName: 'Claude 3 Sonnet',
            provider: 'Anthropic',
            inputPricePerMillion: 3.0,
            outputPricePerMillion: 15.0,
          },
        ],
        fetchedAt: new Date().toISOString(),
      },
    ]);

    const routes = (router as any).stack;
    const getRoute = routes.find((r: any) => 
      r.route?.path === '/:id/available-models' && r.route?.methods?.get
    );

    await getRoute.route.stack[0].handle(mockRequest, mockResponse);

    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      models: [
        {
          modelId: 'gpt-3.5-turbo',
          modelName: 'GPT-3.5 Turbo',
          provider: 'OpenAI',
          description: 'OpenAI - GPT-3.5 Turbo',
        },
        {
          modelId: 'claude-3-sonnet',
          modelName: 'Claude 3 Sonnet',
          provider: 'Anthropic',
          description: 'Anthropic - Claude 3 Sonnet',
        },
      ],
    });
  });

  it('should return all models when channel has no existing models', async () => {
    mockRequest = {
      params: { id: '2' },
      query: { targetUrl: 'https://api.example.com', apiKey: 'test-key' },
    };

    // Mock channel response with no models
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          id: 2,
          name: 'Empty Channel',
          type: 1,
          models: '',
          model_mapping: '',
          status: 1,
          priority: 0,
        },
      },
    });

    // Mock models.dev prices
    const { fetchAllModelsDevPrices } = await import('../services/modelsDevFetcher.js');
    vi.mocked(fetchAllModelsDevPrices).mockResolvedValueOnce([
      {
        provider: 'OpenAI',
        success: true,
        models: [
          {
            modelId: 'gpt-4o',
            modelName: 'GPT-4 Optimized',
            provider: 'OpenAI',
            inputPricePerMillion: 5.0,
            outputPricePerMillion: 15.0,
          },
        ],
        fetchedAt: new Date().toISOString(),
      },
    ]);

    const routes = (router as any).stack;
    const getRoute = routes.find((r: any) => 
      r.route?.path === '/:id/available-models' && r.route?.methods?.get
    );

    await getRoute.route.stack[0].handle(mockRequest, mockResponse);

    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      models: [
        {
          modelId: 'gpt-4o',
          modelName: 'GPT-4 Optimized',
          provider: 'OpenAI',
          description: 'OpenAI - GPT-4 Optimized',
        },
      ],
    });
  });
});
