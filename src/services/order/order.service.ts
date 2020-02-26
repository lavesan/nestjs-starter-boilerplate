import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, UpdateResult } from 'typeorm';
import * as moment from 'moment';

import { OrderEntity } from 'src/entities/order.entity';
import { OrderStatus, OrderUserWhoDeleted } from 'src/model/constants/order.constants';
import { UpdateStatusOrderForm } from 'src/model/forms/order/UpdateStatusOrderForm';
import { PaginationForm } from 'src/model/forms/PaginationForm';
import { skipFromPage, paginateResponseSchema, IPaginateResponseType, generateQueryFilter, failRes, Code } from 'src/helpers/response-schema.helpers';
import { decodeToken } from 'src/helpers/auth.helpers';
import { CancelOrderForm } from 'src/model/forms/order/CancelOrderForm';
import { SendgridService } from '../sendgrid/sendgrid.service';
import { MailType } from 'src/model/constants/sendgrid.constants';
import { UserMailData } from 'src/model/constants/user.constants';

@Injectable()
export class OrderService {

    constructor(
        @InjectRepository(OrderEntity)
        private readonly orderRepo: Repository<OrderEntity>,
        private readonly sendgridService: SendgridService,
    ) {}

    time = {
        open: '08:00',
        close: '18:00',
    };

    async save(order: Partial<OrderEntity>) {

        const data = {
            ...order,
            status: OrderStatus.MADE,
            creationDate: new Date(),
        };

        if (order.user && order.user instanceof UserMailData) {
            this.sendgridService.sendMail({
                type: MailType.NEW_ORDER,
                to: order.user.email,
                name: order.user.name,
                date: order.receiveDate,
                time: order.receiveTime,
                totalValue: order.totalValueCents,
                changeValue: order.changeValueCents,
                orderId: order.id,
            });
        } else {
            delete data.user;
        }

        return await this.orderRepo.save(data)

    }

    async update({ orderId, orderStatus }: UpdateStatusOrderForm): Promise<UpdateResult> {

        const order = await this.findById(orderId);
        const data = {
            ...order,
            updateDate: new Date(),
            status: orderStatus,
        };

        return await this.orderRepo.update({ id: orderId }, data);

    }

    async softDelete(order: CancelOrderForm): Promise<UpdateResult> {

        const findOrder = this.findById(order.orderId);

        const data = {
            ...findOrder,
            status: OrderStatus.CANCELED,
            deletedReason: order.reason,
            userTypeWhoDeleted: OrderUserWhoDeleted.BACKOFFICE,
            deleteDate: new Date(),
        };

        return await this.orderRepo.update({ id: order.orderId }, data);

    }

    async findAllWithToken({ filter, paginationForm, tokenAuth }): Promise<IPaginateResponseType<any>> {

        const tokenObj = decodeToken(tokenAuth);

        if (tokenObj) {
            return await this.findAllFilteredPaginated({
                paginationForm,
                filterOpt: filter,
                id: tokenObj.id,
            });
        }

    }

    async clientCancelOrder({ orderId, reason }: CancelOrderForm): Promise<UpdateResult | any> {

        const order = await this.orderRepo.findOne({ id: orderId });

        if (order.status !== OrderStatus.SENDED && order.status !== OrderStatus.SENDING) {

            const data = {
                ...order,
                status: OrderStatus.CANCELED,
                deletedReason: reason,
                userTypeWhoDeleted: OrderUserWhoDeleted.CLIENT,
                deleteDate: new Date(),
            }

            return this.orderRepo.update({ id: orderId }, data);

        } else {

            return failRes({
                code: Code.NOT_AUTHORIZED,
                message: 'Só é possível cancelar um pedido até antes de ele estar sendo enviado',
            })

        }

    }

    async findAllFilteredPaginated({
        paginationForm: { page, take },
        filterOpt,
        id = false,
    }: any): Promise<IPaginateResponseType<any>> {

        const skip = skipFromPage(page);
        const builder = this.orderRepo.createQueryBuilder('order');

        // Vindo do ecommerce, o usuário só verá os SEUS pedidos
        if (id) {
            builder.where('ord_use_id = :userId', { userId: id });
        }

        const [result, count] = await generateQueryFilter({
            numbers: ['ord_type', 'ord_status'],
            equalStrings: ['ord_get_on_market'],
            valueCentsNumbers: ['ord_total_value_cents', 'ord_total_product_value_cents', 'ord_total_freight_value_cents', 'ord_change_value_cents'],
            datas: Array.isArray(filterOpt) ? filterOpt : [],
            builder,
        })
            .skip(skip)
            .limit(take)
            .orderBy('order.creationDate', 'DESC')
            .getManyAndCount();

        return paginateResponseSchema({ data: result, allResultsCount: count, page, limit: take });

    }

    async findById(orderId: number): Promise<OrderEntity> {
        return await this.orderRepo.findOne({ id: orderId });
    }

    async findActiveDates(dateInString: string) {

        const date = moment(dateInString, 'DD/MM/YYYY').toDate();

        const scheduledDates = await this.orderRepo.find({ receiveDate: date });
        const compareDate = moment(this.time.open, 'HH:mm');
        const close = moment(this.time.close, 'HH:mm');

        const activeTimes = [];

        while (compareDate.isSameOrBefore(close)) {

            const comparedTime = compareDate.format('HH:mm');
            const timeIsFree = !scheduledDates.some(order => {
                const scheduledDate = moment(order.receiveTime, 'HH:mm:ss').format('HH:mm');
                return scheduledDate === comparedTime;
            });

            if (timeIsFree) {
                activeTimes.push({ time: compareDate.format('HH:mm') });
            }

            compareDate.add(30, 'minutes');

        };

        return {
            date: dateInString,
            activeTimes,
        };

    }

}
