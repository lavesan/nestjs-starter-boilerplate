import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { OrderType, OrderStatus } from '../model/constants/order.constants';
import { UserEntity } from './user.entity';
import { OrderToProductEntity } from './orderToProduct.entity';

@Entity('ord_order')
export class OrderEntity {
    @PrimaryGeneratedColumn({ name: 'ord_id' })
    id: number;

    @Column({ name: 'ord_card_code', type: 'varchar', nullable: true })
    cardCode: string;

    @Column({ name: 'ord_type', type: 'integer' })
    type: OrderType;

    @Column({ name: 'ord_status', type: 'integer' })
    status: OrderStatus;

    @Column({ name: 'ord_total_value_cents', type: 'text' })
    totalValueCents: string;

    @Column({ name: 'ord_total_product_value_cents', type: 'text' })
    totalProductValueCents: string;

    @Column({ name: 'ord_total_freight_value_cents', type: 'text', nullable: true })
    totalFreightValuesCents: string;

    @Column({ name: 'ord_get_on_market', type: 'boolean' })
    getOnMarket: boolean;

    // Troco
    @Column({ name: 'ord_change_value_cents', type: 'text', nullable: true })
    changeValueCents: boolean;

    @Column({ name: 'ord_receive_date', type: 'timestamp', nullable: true })
    receiveDate: Date;

    @Column({ name: 'con_creation_date', type: 'timestamp', update: false })
    creationDate: Date;

    @Column({ name: 'con_update_date', type: 'timestamp', nullable: true })
    updateDate: Date;

    @ManyToOne(table => UserEntity, user => user.id)
    @JoinColumn({ name: 'con_use_id' })
    user: UserEntity;

    @OneToMany(type => OrderToProductEntity, ordToProd => ordToProd.order)
    orderToProd: OrderToProductEntity[];
}