# -*- encoding: utf-8 -*-
##############################################################################
#    Copyright (c) 2012 - Present Acespritech Solutions Pvt. Ltd. All Rights Reserved
#    Author: <info@acespritech.com>
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    A copy of the GNU General Public License is available at:
#    <http://www.gnu.org/licenses/gpl.html>.
#
##############################################################################

from openerp import models, api, _
from openerp.osv import fields, osv, orm
from openerp.tools import float_is_zero
import time
import openerp.addons.decimal_precision as dp

class pos_order_line(osv.osv):
    _inherit = "pos.order.line"
    _columns = {
        'prodlot_id': fields.many2one('stock.production.lot', "Serial No."),
        'return_qty': fields.integer('Return QTY', size=64)
    }

class pos_order(osv.osv):
    _inherit = "pos.order"
    _columns = {
        'parent_return_order': fields.integer('Return Order ID', size=64),
        'return_seq': fields.integer('Return Sequence'),
        'return_process': fields.boolean('Return Process'),
        'back_order': fields.char('Back Order', size=256, default=False, copy=False),
        'gift_coupon_amt': fields.float('Gift Coupon Amt', readonly=True),
        'redeem_point_amt': fields.float('Redeem Point Amt', readonly=True),
    }
    
    def check_connection(self, cr, uid, context=None):
        return True
    
    def _order_fields(self, cr, uid, ui_order, context=None):
        return {
            'name':                 ui_order['name'],
            'user_id':              ui_order['user_id'] or False,
            'session_id':           ui_order['pos_session_id'],
            'lines':                ui_order['lines'],
            'pos_reference':        ui_order['name'],
            'partner_id':           ui_order['partner_id'] or False,
            'return_order':         ui_order.get('return_order'),
            'back_order':           ui_order.get('back_order',''),
            'parent_return_order':  ui_order.get('parent_return_order',''),
            'return_seq':           ui_order.get('return_seq',''),
            'gift_coupon_amt':      ui_order.get('gift_coupon_amt') or 0.0,
            'redeem_point_amt':     ui_order.get('redeem_point_amt') or 0.0
        }
        
    def _process_order(self, cr, uid, order, context=None):
        gift_coupon_amt = 0.0
        redeem_point_amt = 0
        points = 0
        if context.get('gift_amount'):
            gift_coupon_amt = context.get('gift_amount')
            order.update({'gift_coupon_amt': gift_coupon_amt})
        
        if order.get('partner_id'):
            partner = self.pool.get('res.partner').browse(cr, uid, int(order.get('partner_id')))
            if context.get('redeem_point'):
                if partner.member and partner.member_cat_id:
                    if partner.member_cat_id.point_2_price and partner.member_cat_id.enable_redeemtion:
                        redeem_point = float(context.get('redeem_point', 0))
                        redeem_point_amt = round(redeem_point * partner.member_cat_id.point_2_price)
            else:
                if partner.member_cat_id and partner.member_cat_id.price_2_point and \
                        (partner.member_cat_id.purchase_limit and \
                        order.get('amount_total') >= partner.member_cat_id.purchase_limit):
                    points = round(order.get('amount_total') / partner.member_cat_id.price_2_point)
        order.update({'redeem_point_amt': redeem_point_amt})
        order_id = self.create(cr, uid, self._order_fields(cr, uid, order, context=context),context)

        total_discount = gift_coupon_amt + redeem_point_amt
        line_discount = 0
        
#        if order['statement_ids']:
#            line_discount = total_discount / len(order['statement_ids'])
#        print "==== line ..", line_discount
        
        for payments in order['statement_ids']:
            if order.get('parent_return_order', ''):
                payments[2]['amount'] = -payments[2]['amount'] or 0.0
            else:
                payments[2]['amount'] -= line_discount
            self.add_payment(cr, uid, order_id, self._payment_fields(cr, uid, payments[2], context=context), context=context)

        if gift_coupon_amt:
            coupon_journal = self.pool.get('account.journal').search(cr, uid, [('code', '=', 'CPNJ')])
            if coupon_journal:
                ctx = context.copy()
                ctx.update({'gift_coupon_amt': True})
                self.add_payment(cr, uid, order_id, {
                    'amount': gift_coupon_amt,
                    'payment_date': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'payment_name': _('Discount'),
                    'journal': coupon_journal[0],
#                        'statement_id': payment['statement_id']    All payment journals will be same if we remove this comment.,
                }, context=ctx)
        
        #store redeem points
        if redeem_point_amt:
            self.pool.get('point.redeem').create(cr, uid,
                    {
                        'partner_id': order.get('partner_id'),
                        'pos_order_id': order_id,
                        'amount_total': order.get('amount_total'),
                        'point': context.get('redeem_point'),
                        'amount_point': redeem_point_amt,
                    })
            redeem_journal = self.pool.get('account.journal').search(cr, uid, [('code', '=', 'RDMJ')])
            if redeem_journal:
                ctx = context.copy()
                ctx.update({'redeem_point_amt': True})
                self.add_payment(cr, uid, order_id, {
                    'amount': redeem_point_amt,
                    'payment_date': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'payment_name': _('Discount'),
                    'journal': redeem_journal[0],
#                        'statement_id': payment['statement_id']    All payment journals will be same if we remove this comment.,
                }, context=ctx)
                
        #store member points
        if points:
            self.pool.get('member.point').create(cr, uid,
                    {
                        'partner_id': order.get('partner_id'),
                        'pos_order_id': order_id,
                        'amount_total': order.get('amount_total'),
                        'point': points,
                    })
            
        session = self.pool.get('pos.session').browse(cr, uid, order['pos_session_id'], context=context)
        if session.sequence_number <= order['sequence_number']:
            session.write({'sequence_number': order['sequence_number'] + 1})
            session.refresh()

        if not float_is_zero(order['amount_return'], self.pool.get('decimal.precision').precision_get(cr, uid, 'Account')):
            cash_journal = session.cash_journal_id
            if not cash_journal:
                cash_journal_ids = filter(lambda st: st.journal_id.type=='cash', session.statement_ids)
                if not len(cash_journal_ids):
                    raise osv.except_osv( _('error!'),
                        _("No cash statement found for this session. Unable to record returned cash."))
                cash_journal = cash_journal_ids[0].journal_id
            self.add_payment(cr, uid, order_id, {
                'amount': -order['amount_return'],
                'payment_date': time.strftime('%Y-%m-%d %H:%M:%S'),
                'payment_name': _('return'),
                'journal': cash_journal.id,
            }, context=context)
        return order_id
    
    def add_payment(self, cr, uid, order_id, data, context=None):
        """Create a new payment for the order"""
        context = dict(context or {})
        statement_line_obj = self.pool.get('account.bank.statement.line')
        property_obj = self.pool.get('ir.property')
        order = self.browse(cr, uid, order_id, context=context)
        args = {
            'amount': data['amount'],
            'date': data.get('payment_date', time.strftime('%Y-%m-%d')),
            'name': order.name + ': ' + (data.get('payment_name', '') or ''),
            'partner_id': order.partner_id and self.pool.get("res.partner")._find_accounting_partner(order.partner_id).id or False,
        }

        journal_id = data.get('journal', False)
        statement_id = data.get('statement_id', False)
        assert journal_id or statement_id, "No statement_id or journal_id passed to the method!"

        journal = self.pool['account.journal'].browse(cr, uid, journal_id, context=context)
        # use the company of the journal and not of the current user
        company_cxt = dict(context, force_company=journal.company_id.id)
        account_def = property_obj.get(cr, uid, 'property_account_receivable', 'res.partner', context=company_cxt)
        args['account_id'] = (order.partner_id and order.partner_id.property_account_receivable \
                             and order.partner_id.property_account_receivable.id) or (account_def and account_def.id) or False
        
        # Added code for gift coupon, redeem coupon.
        
        if context.get('gift_coupon_amt') or context.get('redeem_point_amt'):
            account_pay = property_obj.get(cr, uid, 'property_account_payable', 'res.partner', context=context)
            args['account_id'] = (order.partner_id and order.partner_id.property_account_payable \
                             and order.partner_id.property_account_payable.id) or (account_pay and account_pay.id) or False
        # Code End

        if not args['account_id']:
            if not args['partner_id']:
                msg = _('There is no receivable account defined to make payment.')
            else:
                msg = _('There is no receivable account defined to make payment for the partner: "%s" (id:%d).') % (order.partner_id.name, order.partner_id.id,)
            raise osv.except_osv(_('Configuration Error!'), msg)

        context.pop('pos_session_id', False)

        for statement in order.session_id.statement_ids:
            if statement.id == statement_id:
                journal_id = statement.journal_id.id
                break
            elif statement.journal_id.id == journal_id:
                statement_id = statement.id
                break

        if not statement_id:
            raise osv.except_osv(_('Error!'), _('You have to open at least one cashbox.'))

        args.update({
            'statement_id': statement_id,
            'pos_statement_id': order_id,
            'journal_id': journal_id,
            'ref': order.session_id.name,
        })

        statement_line_obj.create(cr, uid, args, context=context)

        return statement_id
    
    def create_from_ui(self, cr, uid, orders, context=None):
        # Keep only new orders
        submitted_references = [o['data']['name'] for o in orders]
        existing_order_ids = self.search(cr, uid, [('pos_reference', 'in', submitted_references)], context=context)
        existing_orders = self.read(cr, uid, existing_order_ids, ['pos_reference'], context=context)
        existing_references = set([o['pos_reference'] for o in existing_orders])
        orders_to_save = [o for o in orders if o['data']['name'] not in existing_references]
        order_ids = []

        for tmp_order in orders_to_save:
            to_invoice = tmp_order['to_invoice']
            order = tmp_order['data']
            order_id = self._process_order(cr, uid, order, context=context)
            if order_id:
                if order.get('parent_return_order'):
                    pos_line_obj = self.pool.get('pos.order.line')
                    for line in order.get('lines'):
                        if line[2].get('return_process'):
                            ret_prod = pos_line_obj.search(cr, uid, [('order_id', '=', order.get('parent_return_order')),
                                                            ('product_id', '=', line[2].get('product_id')), 
                                                            ('return_qty', '>', 0)])
                            return_qty = pos_line_obj.browse(cr, uid, ret_prod).return_qty
                            if return_qty > 0 and line[2].get('qty') <= return_qty:
                                return_qty = return_qty + line[2].get('qty')
                                pos_line_obj.write(cr, uid, ret_prod, {'return_qty':return_qty});
                
            order_ids.append(order_id)

            try:
                self.signal_workflow(cr, uid, [order_id], 'paid')
            except Exception, e:
                _logger.error('Could not fully process the POS Order: %s', tools.ustr(e))

            if to_invoice:
                self.action_invoice(cr, uid, [order_id], context)
                order_obj = self.browse(cr, uid, order_id, context)
                self.pool['account.invoice'].signal_workflow(cr, uid, [order_obj.invoice_id.id], 'invoice_open')

        return order_ids

    def create_picking(self, cr, uid, ids, context=None):
        """Create a picking for each order and validate it."""
        picking_obj = self.pool.get('stock.picking')
        partner_obj = self.pool.get('res.partner')
        pos_order_pool = self.pool.get('pos.order')
        move_obj = self.pool.get('stock.move')
        stock_pack_pool = self.pool.get('stock.pack.operation')
        for order in self.browse(cr, uid, ids, context=context):
            addr = order.partner_id and partner_obj.address_get(cr, uid, [order.partner_id.id], ['delivery']) or {}
            picking_type = order.picking_type_id
            picking_id = False
            if picking_type:
                picking_id = picking_obj.create(cr, uid, {
                    'origin': order.name,
                    'partner_id': addr.get('delivery', False),
                    'picking_type_id': picking_type.id,
                    'company_id': order.company_id.id,
                    'move_type': 'direct',
                    'note': order.note or "",
                    'invoice_state': 'none',

                }, context=context)
                self.write(cr, uid, [order.id], {'picking_id': picking_id}, context=context)
            location_id = order.location_id.id
            if order.partner_id:
                destination_id = order.partner_id.property_stock_customer.id
            elif picking_type:
                if not picking_type.default_location_dest_id:
                    raise osv.except_osv(_('Error!'), _('Missing source or destination location for picking type %s. Please configure those fields and try again.' % (picking_type.name,)))
                destination_id = picking_type.default_location_dest_id.id
            else:
                destination_id = partner_obj.default_get(cr, uid, ['property_stock_customer'], context=context)['property_stock_customer']

            move_list = []
            for line in order.lines:
                if line.product_id and line.product_id.type == 'service':
                    continue

                move_list.append(move_obj.create(cr, uid, {
                    'name': line.name,
                    'product_uom': line.product_id.uom_id.id,
                    'product_uos': line.product_id.uom_id.id,
                    'picking_id': picking_id,
                    'picking_type_id': picking_type.id,
                    'product_id': line.product_id.id,
                    'product_uos_qty': abs(line.qty),
                    'product_uom_qty': abs(line.qty),
                    'state': 'draft',
                    'location_id': location_id if line.qty >= 0 else destination_id,
                    'location_dest_id': destination_id if line.qty >= 0 else location_id,
#                     'restrict_lot_id': line.prodlot_id.id or False
                }, context=context))

            if picking_id:
                picking_obj.action_confirm(cr, uid, [picking_id], context=context)
                picking_obj.force_assign(cr, uid, [picking_id], context=context)
# CUSTOM CODE
                picking = picking_obj.browse(cr, uid, picking_id, context=context)
                items = []
                packs = []

                if not picking.pack_operation_ids:
                    picking.do_prepare_partial()
                pos_ids = pos_order_pool.search(cr, uid, [('picking_id', '=', picking_id)])
                if pos_ids:
                    pack_op_ids = [x.id for x in picking.pack_operation_ids]
                    for each_line in pos_order_pool.browse(cr, uid, pos_ids[0]).lines:
                        line_product_id = each_line.product_id.id
                        line_lot_id = each_line.prodlot_id.id
                        if line_lot_id:
                            for each_op in picking.pack_operation_ids:
                                    if each_op.product_id.id == line_product_id:
                                        if not each_op.lot_id:
                                            stock_pack_pool.write(cr, uid, each_op.id, {'lot_id': line_lot_id})
                                            break
# CUSTOM CODE
                picking_obj.action_done(cr, uid, [picking_id], context=context)
            elif move_list:
                move_obj.action_confirm(cr, uid, move_list, context=context)
                move_obj.force_assign(cr, uid, move_list, context=context)
                move_obj.action_done(cr, uid, move_list, context=context)
        return True
    
    def action_invoice(self, cr, uid, ids, context=None):
        inv_ref = self.pool.get('account.invoice')
        inv_line_ref = self.pool.get('account.invoice.line')
        product_obj = self.pool.get('product.product')
        inv_ids = []

        for order in self.pool.get('pos.order').browse(cr, uid, ids, context=context):
            if order.invoice_id:
                inv_ids.append(order.invoice_id.id)
                continue

            if not order.partner_id:
                raise osv.except_osv(_('Error!'), _('Please provide a partner for the sale.'))

            acc = order.partner_id.property_account_receivable.id
            inv = {
                'name': order.name,
                'origin': order.name,
                'account_id': acc,
                'journal_id': order.sale_journal.id or None,
                'type': 'out_invoice',
                'reference': order.name,
                'partner_id': order.partner_id.id,
                'comment': order.note or '',
                'currency_id': order.pricelist_id.currency_id.id, # considering partner's sale pricelist's currency
                #start added code
                'redeem_point_amt': context.get('redeem_point'),
                'gift_coupan_amt': context.get('gift_amount')
                #end added code
            }
            inv.update(inv_ref.onchange_partner_id(cr, uid, [], 'out_invoice', order.partner_id.id)['value'])
            if not inv.get('account_id', None):
                inv['account_id'] = acc
            inv_id = inv_ref.create(cr, uid, inv, context=context)

            self.write(cr, uid, [order.id], {'invoice_id': inv_id, 'state': 'invoiced'}, context=context)
            inv_ids.append(inv_id)
            for line in order.lines:
                inv_line = {
                    'invoice_id': inv_id,
                    'product_id': line.product_id.id,
                    'quantity': line.qty,
                }
                inv_name = product_obj.name_get(cr, uid, [line.product_id.id], context=context)[0][1]
                inv_line.update(inv_line_ref.product_id_change(cr, uid, [],
                                                               line.product_id.id,
                                                               line.product_id.uom_id.id,
                                                               line.qty, partner_id = order.partner_id.id,
                                                               fposition_id=order.partner_id.property_account_position.id)['value'])
                inv_line['price_unit'] = line.price_unit
                inv_line['discount'] = line.discount
                inv_line['name'] = inv_name
                inv_line['invoice_line_tax_id'] = [(6, 0, [x.id for x in line.product_id.taxes_id] )]
                inv_line_ref.create(cr, uid, inv_line, context=context)
            inv_ref.button_reset_taxes(cr, uid, [inv_id], context=context)
            self.signal_workflow(cr, uid, [order.id], 'invoice')
            inv_ref.signal_workflow(cr, uid, [inv_id], 'validate')

        if not inv_ids: return {}

        mod_obj = self.pool.get('ir.model.data')
        res = mod_obj.get_object_reference(cr, uid, 'account', 'invoice_form')
        res_id = res and res[1] or False
        return {
            'name': _('Customer Invoice'),
            'view_type': 'form',
            'view_mode': 'form',
            'view_id': [res_id],
            'res_model': 'account.invoice',
            'context': "{'type':'out_invoice'}",
            'type': 'ir.actions.act_window',
            'nodestroy': True,
            'target': 'current',
            'res_id': inv_ids and inv_ids[0] or False,
        }

class account_journal(osv.osv):
    _inherit = "account.journal"
    _columns = {
        'pos_front_display': fields.boolean('Display in POS Front')
    }
    _defaults = {
        'pos_front_display': False,
    }
account_journal()