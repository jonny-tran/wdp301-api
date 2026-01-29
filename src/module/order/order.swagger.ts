import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiCommonErrors } from 'src/common/swagger/error.swagger';
import {
  CreateOrderResponseDto,
  ProductCatalogDto,
} from './dto/order-response.dto';

export const ApiGetCatalog = () => {
  return applyDecorators(
    ApiOperation({ summary: 'Get product catalog for blind ordering' }),
    ApiResponse({
      status: 200,
      description: 'List of active products for ordering',
      type: [ProductCatalogDto],
    }),
    ApiCommonErrors(),
  );
};

export const ApiCreateOrder = () => {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new order' }),
    ApiResponse({
      status: 201,
      description: 'Order created successfully',
      type: CreateOrderResponseDto,
    }),
    ApiCommonErrors(),
  );
};

export const ApiGetMyStoreOrders = () => {
  return applyDecorators(
    ApiOperation({ summary: 'Get order history for current store' }),
    ApiResponse({
      status: 200,
      description: 'List of orders for the logged-in store',
      type: [CreateOrderResponseDto],
    }),
    ApiCommonErrors(),
  );
};

export const ApiGetCoordinatorOrders = () => {
  return applyDecorators(
    ApiOperation({
      summary: 'Get orders for coordinator (supports filtering)',
    }),
    ApiResponse({
      status: 200,
      description: 'List of orders from all stores',
      type: [CreateOrderResponseDto],
    }),
    ApiCommonErrors(),
  );
};

export const ApiGetOrderDetails = () => {
  return applyDecorators(
    ApiOperation({
      summary: 'Get order details (Blind - no stock info)',
    }),
    ApiResponse({
      status: 200,
      description: 'Order details successfully retrieved',
      type: CreateOrderResponseDto,
    }),
    ApiCommonErrors(),
  );
};

export const ApiReviewOrder = () => {
  return applyDecorators(
    ApiOperation({
      summary:
        'Review order details with stock availability (Coordinator only)',
    }),
    ApiResponse({
      status: 200,
      description: 'Order details with stock availability retrieved',
    }),
    ApiCommonErrors(),
  );
};

export const ApiApproveOrder = () => {
  return applyDecorators(
    ApiOperation({ summary: 'Approve an order (Coordinator only)' }),
    ApiResponse({
      status: 200,
      description: 'Order approved successfully',
    }),
    ApiCommonErrors(),
  );
};

export const ApiRejectOrder = () => {
  return applyDecorators(
    ApiOperation({ summary: 'Reject an order (Coordinator only)' }),
    ApiResponse({
      status: 200,
      description: 'Order rejected successfully',
    }),
    ApiCommonErrors(),
  );
};

export const ApiCancelOrder = () => {
  return applyDecorators(
    ApiOperation({ summary: 'Cancel an order (Store Staff only)' }),
    ApiResponse({
      status: 200,
      description: 'Order cancelled successfully',
    }),
    ApiCommonErrors(),
  );
};
