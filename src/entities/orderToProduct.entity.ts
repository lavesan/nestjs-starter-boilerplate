import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, JoinTable } from 'typeorm';
import { OrderEntity } from './order.entity';
import { ProductEntity } from './product.entity';

@Entity('orp_order_product')
export class OrderToProductEntity {
    @PrimaryGeneratedColumn({ name: 'orp_id' })
    id: number;

    @Column({ name: 'orp_quantity', type: 'float8' })
    quantity: string;

    @ManyToOne(type => OrderEntity, order => order.id)
    @JoinColumn({ name: 'orp_ord_id' })
    order: OrderEntity;
    
    @ManyToOne(type => ProductEntity, product => product.id)
    @JoinColumn({ name: 'orp_pro_id' })
    product: ProductEntity;
}