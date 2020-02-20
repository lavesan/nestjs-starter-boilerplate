import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderToProductEntity } from 'src/entities/orderToProduct.entity';
import { Repository } from 'typeorm';
import { SaveOrderForm } from 'src/model/forms/order/SaveOrderForm';
import { OrderService } from '../order/order.service';
import { ProductService } from '../product/product.service';
import { decodeToken } from 'src/helpers/auth.helpers';
import { UserService } from '../user/user.service';
import { ScheduledTimeService } from 'src/service/scheduled-time/scheduled-time.service';
import { onlyNumberStringToFloatNumber, floatNumberToOnlyNumberString } from 'src/helpers/calc.helpers';

@Injectable()
export class OrderToProductService {
    constructor(
        @InjectRepository(OrderToProductEntity)
        private readonly orderToProductRepo: Repository<OrderToProductEntity>,
        private readonly orderService: OrderService,
        private readonly productService: ProductService,
        private readonly userService: UserService,
        private readonly scheduledTimeService: ScheduledTimeService,
    ) {}

    /**
     * @description Saves a new order
     * @param {SaveOrderForm} param0
     * @param {string} token If there's a token, use this to save the user
     */
    async save({ products, ...body }: SaveOrderForm, token: string) {

        const { receiveDate, ...orderBody } = body;

        const tokenObj = decodeToken(token);

        const data: any = {
            ...orderBody,
            totalValueCents: 0,
            totalProductValueCents: 0,
            user: {},
        };

        // If the token exists, the user is vinculated with the order
        if (tokenObj) {

            const user = await this.userService.findById(tokenObj.id);
            data.user = user;

        }

        const productsIds = products.map(product => product.id);
        const productsDB = await this.productService.findManyByIds(productsIds);
        const productsWithQuantity = productsDB.map(product => {

            const { quantity } = products.find(prod => prod.id === product.id);

            return {
                ...product,
                quantity,
            };
        });

        for (const { actualValueCents, quantity } of productsWithQuantity) {
            data.totalProductValueCents += onlyNumberStringToFloatNumber(actualValueCents) * quantity;
        }

        data.totalValueCents = data.totalProductValueCents + onlyNumberStringToFloatNumber(data.totalFreightValuesCents);

        data.totalValueCents = floatNumberToOnlyNumberString(data.totalValueCents);
        data.totalProductValueCents = floatNumberToOnlyNumberString(data.totalProductValueCents);

        // Saves the order
        const order = await this.orderService.save(data);

        // totalValueCents: string;
        // totalProductValueCents: string;

        // Saves the time as scheduled, so it won't be selected by another user
        if (receiveDate) {

            const receiveData = {
                ...receiveDate,
                orderId: order.id,
            };

            await this.scheduledTimeService.saveOne(receiveData);

        }

        if (order) {

            const insertValues = [];

            for (const { quantity, ...productDB } of productsWithQuantity) {
                insertValues.push({
                    quantity,
                    product: productDB,
                    order,
                });
            }

            return await this.orderToProductRepo.createQueryBuilder()
                .insert()
                .values(insertValues)
                .execute();

        }

    }

    async findAllProductFromOrder(orderId: number) {
        const [result, count] = await this.orderToProductRepo.findAndCount({
            where: { order: { id: orderId } }
        });

        if (result) {
            const data = result.map(ordToProd => ({
                quantity: ordToProd.quantity,
                product: {
                    id: ordToProd.product.id,
                    name: ordToProd.product.name,
                },
            }));
        }
    }
}
