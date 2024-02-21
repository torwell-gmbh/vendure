import type { ListParameters } from '@mollie/api-client/dist/types/src/binders/methods/parameters';
import {
    Injector,
    Order,
    PluginCommonModule,
    RequestContext,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';

import { PLUGIN_INIT_OPTIONS } from './constants';
import { orderCustomFields } from './custom-fields';
import { shopSchema } from './mollie-shop-schema';
import { MollieController } from './mollie.controller';
import { molliePaymentHandler } from './mollie.handler';
import { MollieResolver } from './mollie.resolver';
import { MollieService } from './mollie.service';

export type AdditionalEnabledPaymentMethodsParams = Partial<Omit<ListParameters, 'resource'>>;

/**
 * @description
 * Configuration options for the Mollie payments plugin.
 *
 * @docsCategory core plugins/PaymentsPlugin
 * @docsPage MolliePlugin
 */
export interface MolliePluginOptions {
    /**
     * @description
     * The host of your Vendure server, e.g. `'https://my-vendure.io'`.
     * This is used by Mollie to send webhook events to the Vendure server
     */
    vendureHost: string;

    /**
     * @description
     * For backwards compatibility, by default set to false.
     * This option will be deprecated in a future version.
     * When enabled, the `redirectUrl` can be passed via the `createPaymentIntent` mutation
     * instead of being configured in the Payment Method.
     *
     * @default false
     * @since 2.0.0
     */
    useDynamicRedirectUrl?: boolean;

    /**
     * @description
     * Provide additional parameters to the Mollie enabled payment methods API call. By default,
     * the plugin will already pass the `resource` parameter.
     *
     * For example, if you want to provide a `locale` and `billingCountry` for the API call, you can do so like this:
     *
     * **Note:** The `order` argument is possibly `null`, this could happen when you fetch the available payment methods
     * before the order is created.
     *
     * @example
     * ```ts
     * import { VendureConfig } from '\@vendure/core';
     * import { MolliePlugin, getLocale } from '\@vendure/payments-plugin/package/mollie';
     *
     * export const config: VendureConfig = {
     *   // ...
     *   plugins: [
     *     MolliePlugin.init({
     *       enabledPaymentMethodsParams: (injector, ctx, order) => {
     *         const locale = order?.billingAddress?.countryCode
     *             ? getLocale(order.billingAddress.countryCode, ctx.languageCode)
     *             : undefined;
     *
     *         return {
     *           locale,
     *           billingCountry: order?.billingAddress?.countryCode,
     *         },
     *       }
     *     }),
     *   ],
     * };
     * ```
     *
     * @since 2.2.0
     */
    enabledPaymentMethodsParams?: (
        injector: Injector,
        ctx: RequestContext,
        order: Order | null,
    ) => AdditionalEnabledPaymentMethodsParams | Promise<AdditionalEnabledPaymentMethodsParams>;
}

/**
 * @description
 * Plugin to enable payments through the [Mollie platform](https://docs.mollie.com/).
 * This plugin uses the Order API from Mollie, not the Payments API.
 *
 * ## Requirements
 *
 * 1. You will need to create a Mollie account and get your apiKey in the dashboard.
 * 2. Install the Payments plugin and the Mollie client:
 *
 *     `yarn add \@vendure/payments-plugin \@mollie/api-client`
 *
 *     or
 *
 *     `npm install \@vendure/payments-plugin \@mollie/api-client`
 *
 * ## Setup
 *
 * 1. Add the plugin to your VendureConfig `plugins` array:
 *     ```ts
 *     import { MolliePlugin } from '\@vendure/payments-plugin/package/mollie';
 *
 *     // ...
 *
 *     plugins: [
 *       MolliePlugin.init({ vendureHost: 'https://yourhost.io/', useDynamicRedirectUrl: true }),
 *     ]
 *     ```
 * 2. Run a database migration to add the `mollieOrderId` custom field to the order entity.
 * 3. Create a new PaymentMethod in the Admin UI, and select "Mollie payments" as the handler.
 * 4. Set your Mollie apiKey in the `API Key` field.
 *
 * ## Specifying the redirectUrl
 *
 * Currently, there are two ways to specify the `redirectUrl` to which the customer is redirected after completing the payment:
 * 1. Configure the `redirectUrl` in the PaymentMethod.
 * 2. Pass the `redirectUrl` as an argument to the `createPaymentIntent` mutation.
 *
 * Which method is used depends on the value of the `useDynamicRedirectUrl` option while initializing the plugin.
 * By default, this option is set to `false` for backwards compatibility. In a future version, this option will be deprecated.
 * Upon deprecation, the `redirectUrl` will always be passed as an argument to the `createPaymentIntent` mutation.
 *
 * ## Storefront usage
 *
 * In your storefront you add a payment to an order using the `createMolliePaymentIntent` mutation. In this example, our Mollie
 * PaymentMethod was given the code "mollie-payment-method". The `redirectUrl``is the url that is used to redirect the end-user
 * back to your storefront after completing the payment. When using the first method specified in `Specifying the redirectUrl`,
 * the order code is appened to the `redirectUrl`. For the second method, the order code is not appended to the specified `redirectUrl`.
 *
 * ```GraphQL
 * mutation CreateMolliePaymentIntent {
 *   createMolliePaymentIntent(input: {
 *     redirectUrl: "https://storefront/order"
 *     paymentMethodCode: "mollie-payment-method"
 *     molliePaymentMethodCode: "ideal"
 *   }) {
 *          ... on MolliePaymentIntent {
 *               url
 *           }
 *          ... on MolliePaymentIntentError {
 *               errorCode
 *               message
 *          }
 *   }
 * }
 * ```
 *
 * The response will contain
 * a redirectUrl, which can be used to redirect your customer to the Mollie
 * platform.
 *
 * 'molliePaymentMethodCode' is an optional parameter that can be passed to skip Mollie's hosted payment method selection screen
 * You can get available Mollie payment methods with the following query:
 *
 * ```GraphQL
 * {
 *  molliePaymentMethods(input: { paymentMethodCode: "mollie-payment-method" }) {
 *    id
 *    code
 *    description
 *    minimumAmount {
 *      value
 *      currency
 *    }
 *    maximumAmount {
 *      value
 *      currency
 *    }
 *    image {
 *      size1x
 *      size2x
 *      svg
 *    }
 *  }
 * }
 * ```
 * You can pass `MolliePaymentMethod.code` to the `createMolliePaymentIntent` mutation to skip the method selection.
 *
 * After completing payment on the Mollie platform,
 * the user is redirected to the configured redirect url + orderCode: `https://storefront/order/CH234X5`
 *
 * ## Pay later methods
 * Mollie supports pay-later methods like 'Klarna Pay Later'. For pay-later methods, the status of an order is
 * 'PaymentAuthorized' after the Mollie hosted checkout. You need to manually settle the payment via the admin ui to capture the payment!
 * Make sure you capture a payment within 28 days, because this is the Klarna expiry time
 *
 * If you don't want this behaviour (Authorized first), you can set 'autoCapture=true' on the payment method. This option will immediately
 * capture the payment after a customer authorizes the payment.
 *
 * ## ArrangingAdditionalPayment state
 *
 * In some rare cases, a customer can add items to the active order, while a Mollie payment is still open,
 * for example by opening your storefront in another browser tab.
 * This could result in an order being in `ArrangingAdditionalPayment` status after the customer finished payment.
 * You should check if there is still an active order with status `ArrangingAdditionalPayment` on your order confirmation page,
 * and if so, allow your customer to pay for the additional items.
 *
 * @docsCategory core plugins/PaymentsPlugin
 * @docsPage MolliePlugin
 * @docsWeight 0
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    controllers: [MollieController],
    providers: [MollieService, { provide: PLUGIN_INIT_OPTIONS, useFactory: () => MolliePlugin.options }],
    configuration: (config: RuntimeVendureConfig) => {
        config.paymentOptions.paymentMethodHandlers.push(molliePaymentHandler);
        config.customFields.Order.push(...orderCustomFields);
        return config;
    },
    shopApiExtensions: {
        schema: shopSchema,
        resolvers: [MollieResolver],
    },
    compatibility: '^2.0.0',
})
export class MolliePlugin {
    static options: MolliePluginOptions;

    /**
     * @description
     * Initialize the mollie payment plugin
     * @param vendureHost is needed to pass to mollie for callback
     * @param useDynamicRedirectUrl to indicate if the redirectUrl can be passed via the `createPaymentIntent` mutation, versus being configured in the Payment Method.
     */
    static init(options: MolliePluginOptions): typeof MolliePlugin {
        this.options = options;
        return MolliePlugin;
    }
}
