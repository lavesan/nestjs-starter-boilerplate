import { Injectable, HttpService, HttpException, HttpStatus } from '@nestjs/common';
import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import * as fs from 'fs';
import { URLSearchParams } from 'url';
import fetch, { Request, Headers } from 'node-fetch';

import { SaveCardForm } from 'src/model/forms/getnet/SaveCardForm';
import { CardBrand } from 'src/model/constants/getnet.constants';
import { getnetOrderId, getnetUserId } from 'src/helpers/getnet.helpers';
import { UserEntity } from 'src/entities/user.entity';
import { OrderEntity } from 'src/entities/order.entity';

interface IGetnetLoginResponse {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    scope: 'oob';
}

interface ISavedCardResponse {
    card_id: string;
    number_token: string;
}

interface ICardGetnetSafebox {
    card_id: string;
    last_four_digits: string;
    expiration_month: string;
    expiration_year: string;
    brand: string;
    cardholder_name: string;
    customer_id: number;
    number_token: string;
    used_at: Date;
    created_at: Date;
    updated_at: Date;
    status: 'active' | 'inactive';
}

interface IPayDebitResponse {
    payment_id: string;
    seller_id: string;
    redirect_url: string;
    post_data: {
        issuer_payment_id: string;
        payer_authentication_request: string;
    }
}

interface IAuthenticatedDebitPayment {
    payment_id: string;
    seller_id: string;
    amount: number;
    currency: string;
    order_id: string;
    status: string;
    payment_received_timestamp: string;
    debit: {
      authorization_code: string;
      authorization_timestamp: string;
      reason_code: number;
      reason_message: string;
      acquirer: string;
      soft_descriptor: string;
      brand: string;
      terminal_nsu: string;
      acquirer_transaction_id: string;
    }
  }

interface IPayCredit {
    card: SaveCardForm;
    amount: number;
    user: UserEntity | null;
}

@Injectable()
export class GetnetService {

    constructor(private readonly httpService: HttpService) {
        // 'https://api-sandbox.getnet.com.br'
        this.httpService.axiosRef.defaults.baseURL = process.env.GETNET_API_URL;
        this.httpService.axiosRef.interceptors.request.use(req => {
            this.addAuthHeader(req);
            return req;
        });
        this.httpService.axiosRef.interceptors.response.use(
            res => res.data ? Promise.resolve(res.data) : Promise.resolve(res),
            (err: AxiosError) => err.response ? Promise.reject(err.response.data) :  Promise.reject(err.response),
        );
    }

    private readonly jsonFile = './src/services/getnet/getnet-data.json';

    private addAuthHeader(req: AxiosRequestConfig): AxiosRequestConfig {

        const rawData: any = fs.readFileSync(this.jsonFile);

        if (rawData) {

            const { token_type, access_token }: IGetnetLoginResponse = JSON.parse(rawData);
            const autorization = `${token_type} ${access_token}`;

            req.headers = {
                ...req.headers,
                autorization,
            };

        }

        return req;

    }

    // TODO: Adicionar JOB para escrever as credenciais no arquivo getnet-data.json sempre que expirar
    async writeAuthTokenOnFile() {

        const loginAuth = await this.login();

        if (loginAuth) {

            const stringifyData = JSON.stringify(loginAuth);
            fs.writeFileSync(this.jsonFile, stringifyData);

        }

    }

    /**
     * @description Autentica o cliente para usar os serviços da getnet
     */
    private async login(): Promise<IGetnetLoginResponse> {

        const clientId = process.env.GETNET_CLIENT_ID;
        const clientSecret = process.env.GETNET_CLIENT_SECRET;

        // Transforms a String in a Base64 String
        const base64Token = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        // btoa(`${clientId}:${clientSecret}`)
        const autorization = `Basic  ${base64Token}`;

        const h = new Headers();
        h.append('Authorization', autorization);
        h.append('Content-Type', 'application/x-www-form-urlencoded');

        const formParameters = new URLSearchParams();
        formParameters.append('scope', 'oob');
        formParameters.append('grant_type', 'client_credentials');

        const req = new Request(`${process.env.GETNET_API_URL}/auth/oauth/v2/token`, {
            method: 'POST',
            body: formParameters,
            headers: h,
            mode: 'cors',
        });

        return fetch(req)
            .then(res => res.json());

    }

    private getAuthHeader({ contentType = 'application/json' } = { contentType: 'application/json' }): Headers {

        const rawData: any = fs.readFileSync(this.jsonFile);

        const h = new Headers();

        if (rawData) {

            const { token_type, access_token }: IGetnetLoginResponse = JSON.parse(rawData);
            const autorization = `${token_type} ${access_token}`;

            h.append('Authorization', autorization);
            h.append('seller_id', process.env.GETNET_SELLER_ID);
            h.append('Content-Type', contentType);
            h.append('Accept', 'application/json, text/plain, */*');

        }

        return h;

    }

    // SALVANDO CARTÃO E COLETANDO SEUS DADOS POSTERIORMENTE

    // 1 step - Criando um token para o cartão
    private async generateTokenCard({ cardNumber, userId }): Promise<any> {
        // TODO: Vou precisar pegar o ID do ecommerce de Lis e utilizar, isto é OBRIGATÓRIO quando for para produção
        // https://developers.getnet.com.br/api#tag/Tokenizacao%2Fpaths%2F~1v1~1tokens~1card%2Fpost

        const body = {
            card_number: cardNumber,
            // customer_id: userId,
        };

        const h = this.getAuthHeader();

        const req = new Request(`${process.env.GETNET_API_URL}/v1/tokens/card`, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: h,
            mode: 'cors',
        });

        return fetch(req)
            .then(res => res.json());

    }

    // 2 step - Salvando o cartão no cofre
    // Response type - ISavedCardResponse
    async saveCard({ brand, nameOnCard, cardNumber, expirationMonth, expirationYear, securityCode }: SaveCardForm): Promise<any> {

        const cardToken = await this.generateTokenCard({ cardNumber, userId: 1 });

        const body = {
            brand,
            number_token: cardToken.number_token,
            // Número no cartão, de 16 à 19 dígitos
            card_number: '',
            cardholder_name: nameOnCard,
            expiration_month: expirationMonth,
            expiration_year: expirationYear,
            security_code: securityCode,
            // Se eu quiser nota fiscal, precisa (SEM MÁSCARA)
            cardholder_identification: 'cpf ou cnpj do usuário',
            // Eu escolho qual o ID deste usuário
            customer_id: 1,
            verify_card: true,
        };

        return this.httpService.post('/v1/cards', body).toPromise();

    }

    // 3 step - Coletando os dados do cartão no cofre
    // Response type - ICardGetnetSafebox
    async getCardData(cardId: string) {
        return this.httpService.get(`/v1/cards/${cardId}`).toPromise();
    }

    // 4 step - Remover o cartão do cofre
    async removeCard(cardId: string) {
        return this.httpService.delete(`/v1/cards/${cardId}`).toPromise();
    }

    async downloadPdf(paymentId: string) {
        return this.httpService.get(`https://api-homologacao.getnet.com.br/v1/payments/boleto/${paymentId}/pdf`);
    }

    /**
     * @description Solicita o cancelamento de compras feitas a mais de um dia
     */
    // async orderCancel() {

    //     const data = {

    //     };

    //     return this.httpService.post('/v1/payments/cancel/request');
    // }

    /**
     * @description Cancela pagamentos feitos APENAS NO MESMO DIA
     */
    async cancelPayment(order: OrderEntity) {

        const headers = this.getAuthHeader();

        const req = new Request(`${process.env.GETNET_API_URL}/v1/payments/credit/${order.getnetPaymentId}/cancel`, {
            method: 'POST',
            headers,
            mode: 'cors',
        });

        return fetch(req)
            .then(res => res.json());
    }

    /**
     * @description Verifica se o pagamento de uma cancelamento foi realmente cancelado
     * @param {string} cancelId 
     */
    async verifyCancelPayment(cancelId: string) {

        const headers = this.getAuthHeader();

        const req = new Request(`${process.env.GETNET_API_URL}/v1/payments/cancel/request?cancel_custom_key=${cancelId}`, {
            method: 'GET',
            headers,
            mode: 'cors',
        });

        return fetch(req)
            .then(res => res.json());

    }

    /**
     * @description Primeiro passo do pagamento em débito
     */
    async payDebitFirstStep({ card, amount, user }: IPayCredit): Promise<IPayDebitResponse> {

        const cardToken = await this.generateTokenCard({ cardNumber: card.cardNumber, userId: getnetUserId(user.id) });

        if ([CardBrand.MASTERCARD, CardBrand.VISA].includes(card.brand)) {

            await this.verifyCard({ ...card, cardToken })
                .catch(err => {
                    console.log('error: ', err);
                    throw new HttpException({
                        code: HttpStatus.NOT_ACCEPTABLE,
                        message: 'Infelizmente este cartão não passou na validação.',
                    }, HttpStatus.NOT_ACCEPTABLE);
                });

        }

        let customerData = {};

        if (user) {
            customerData = {
                name: user.name,
                email: user.email,
                first_name: '',
                last_name: '',
                // phone_number: user,
                document_number: user.legalDocument,
                document_type: user.legalDocumentType,
            }
        }

        if (cardToken) {

            const body = {
                seller_id: process.env.GETNET_SELLER_ID,
                amount,
                currency: 'BRL',
                order: {
                    // Identificador da compra (eu seto isso)
                    order_id: getnetOrderId(12345),
                },
                customer: {
                    // Identificador do comprador (eu setei isso)
                    customer_id: getnetUserId(user.id),
                    billing_address: {},
                    ...customerData,
                },
                device: {},
                shippings: [
                    {
                    address: {},
                    },
                ],
                debit: {
                    card: {
                        number_token: cardToken.number_token,
                        // Nome do comprador no cartão
                        cardholder_name: card.nameOnCard,
                        // Mês de expiração
                        expiration_month: card.expirationMonth,
                        // Ano de expiração
                        expiration_year: card.expirationYear,
                    },
                },
            };

            const h = this.getAuthHeader();

            const req = new Request(`${process.env.GETNET_API_URL}/v1/payments/debit`, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: h,
                mode: 'cors',
            });

            return fetch(req)
                .then(res => res.json());

        }

    }

    async authenticateDebitPayment({ payment_id }): Promise<IAuthenticatedDebitPayment> {

        const headers = this.getAuthHeader();

        const body = {
            payment_id,
        };

        const req = new Request(`https://api-sandbox.getnet.com.br/v1/payments/debit/${payment_id}/authenticated/finalize`, {
            method: 'POST',
            body: JSON.stringify(body),
            headers,
            mode: 'cors',
        });

        return fetch(req)
            .then(res => res.json());

    }

    /**
     * @description Adicionar corpo com lógica https://developers.getnet.com.br/api#tag/Pagamento%2Fpaths%2F~1v1~1payments~1credit%2Fpost
     */
    async payCredit({ card, amount, user }: IPayCredit) {

        const cardToken = await this.generateTokenCard({ cardNumber: card.cardNumber, userId: getnetUserId(user.id) });

        if ([CardBrand.MASTERCARD, CardBrand.VISA].includes(card.brand)) {

            await this.verifyCard({ ...card, cardToken })
                .catch(err => {
                    console.log('error: ', err);
                    throw new HttpException({
                        code: HttpStatus.NOT_ACCEPTABLE,
                        message: 'Infelizmente este cartão não passou na validação.',
                    }, HttpStatus.NOT_ACCEPTABLE);
                });

        }

        let customerData = {};

        if (user) {
            customerData = {
                name: user.name,
                email: user.email,
                first_name: '',
                last_name: '',
                // phone_number: user,
                document_number: user.legalDocument,
                document_type: user.legalDocumentType,
            }
        }

        if (cardToken) {

            const body = {
                seller_id: process.env.GETNET_SELLER_ID,
                amount,
                currency: 'BRL',
                order: {
                    // Identificador da compra (eu seto isso)
                    order_id: getnetOrderId(12345),
                },
                customer: {
                    // Identificador do comprador (eu setei isso)
                    customer_id: '12345',
                    billing_address: {},
                    ...customerData,
                },
                device: {},
                // shippings: [
                //     {
                //     address: {},
                //     },
                // ],
                credit: {
                    // Se o crédito será feito com confirmação tardia
                    delayed: false,
                    // Se o cartão deve ser salvo para futuras compras
                    save_card_data: false,
                    // Tipo da transação
                    transaction_type: 'FULL',
                    number_installments: 1,
                    card: {
                        number_token: cardToken.number_token,
                        // Nome do comprador no cartão
                        cardholder_name: card.nameOnCard,
                        // Mês de expiração
                        expiration_month: card.expirationMonth,
                        // Ano de expiração
                        expiration_year: card.expirationYear,
                    },
                },
            };

            const h = this.getAuthHeader();

            const req = new Request(`${process.env.GETNET_API_URL}/v1/payments/credit`, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: h,
                mode: 'cors',
            });

            const response = await fetch(req)
                .then(res => res.json())
                .catch(err => {
                    console.log('error: ', err);
                    throw new HttpException({
                        code: HttpStatus.NOT_ACCEPTABLE,
                        message: 'Falha ao finalizar o pagamento. Por favor, cheque seus dados e tente novamente.',
                    }, HttpStatus.NOT_ACCEPTABLE);
                });

            return this.finishCreditPayment(response.payment_id);

        }

    }

    /**
     * @description Verifica se o cartão é válido. APENAS bandeiras: Mastercard e Visa
     */
    private async verifyCard(card: SaveCardForm | any) {

        const body = {
            number_token: card.cardToken,
            brand: card.brand,
            cardholder_name: card.nameOnCard,
            expiration_month: card.expirationMonth,
            expiration_year: card.expirationYear,
            security_code: card.securityCode,
        };

        const h = this.getAuthHeader();

        const req = new Request(`${process.env.GETNET_API_URL}/v1/cards/verification`, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: h,
            mode: 'cors',
        });

        return fetch(req)
            .then(res => res.json());

    }

    async finishDebitPayment(body: any) {

        console.log('body: ', body);

        const h = this.getAuthHeader();

        const req = new Request(`${process.env.GETNET_API_URL}/v1/payments/debit/${body.paymentId}/authenticated/finalize`, {
            method: 'POST',
            headers: h,
            mode: 'cors',
        });

        return fetch(req)
            .then(res => res.json());

    }

    private async finishCreditPayment(paymentId: string) {

        const h = this.getAuthHeader();

        const req = new Request(`${process.env.GETNET_API_URL}/v1/payments/credit/${paymentId}/authenticated/finalize`, {
            method: 'POST',
            headers: h,
            mode: 'cors',
        });

        return fetch(req)
            .then(res => res.json());

    }

}
