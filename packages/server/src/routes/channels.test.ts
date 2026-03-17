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

    // Mock store.getChannelSources to return a source matching the channel's base_url
    vi.spyOn(mockStore, 'getChannelSources').mockReturnValue([
      { id: 1, name: 'Source 1', baseUrl: 'https://upstream.example.com/v1', apiKey: 'src-key', channelKey: 'ch-key', userId: '', enabled: true, isOwnInstance: false, groupName: null, parentSourceId: null, detectedBasePrice: null, remark: null, createdAt: new Date().toISOString() },
    ] as any);

    // Mock channel response with existing models and base_url matching the source
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
          base_url: 'https://upstream.example.com/v1',
        },
      },
    });

    // Mock /v1/models response from upstream
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'gpt-4o' },
          { id: 'gpt-3.5-turbo' },
          { id: 'claude-3-opus' },
          { id: 'claude-3-sonnet' },
        ],
      },
    });

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
          modelName: 'gpt-3.5-turbo',
          provider: 'Source 1',
          description: 'Source 1 - gpt-3.5-turbo',
        },
        {
          modelId: 'claude-3-sonnet',
          modelName: 'claude-3-sonnet',
          provider: 'Source 1',
          description: 'Source 1 - claude-3-sonnet',
        },
      ],
    });
  });

  it('should return all models when channel has no existing models', async () => {
    mockRequest = {
      params: { id: '2' },
      query: { targetUrl: 'https://api.example.com', apiKey: 'test-key' },
    };

    // Mock store.getChannelSources to return a source matching the channel's base_url
    vi.spyOn(mockStore, 'getChannelSources').mockReturnValue([
      { id: 1, name: 'Source 1', baseUrl: 'https://upstream.example.com/v1', apiKey: 'src-key', channelKey: 'ch-key', userId: '', enabled: true, isOwnInstance: false, groupName: null, parentSourceId: null, detectedBasePrice: null, remark: null, createdAt: new Date().toISOString() },
    ] as any);

    // Mock channel response with no models and base_url matching the source
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
          base_url: 'https://upstream.example.com/v1',
        },
      },
    });

    // Mock /v1/models response from upstream
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'gpt-4o' },
        ],
      },
    });

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
          modelName: 'gpt-4o',
          provider: 'Source 1',
          description: 'Source 1 - gpt-4o',
        },
      ],
    });
  });
});
