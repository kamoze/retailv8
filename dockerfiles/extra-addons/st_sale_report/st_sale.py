# -*- coding: utf-8 -*-
##############################################################################
#
#    OpenERP, Open Source Management Solution
#    Copyright (C) 2004-2010 Tiny SPRL (<http://tiny.be>).
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
##############################################################################

import time
from openerp.osv import osv, fields

class account_invoice(osv.osv):
    _inherit = "account.invoice"

    def _compute_total_paid(self, cr, uid, ids, field, arg, context=None):
        res = {}
        for move in self.browse(cr, uid, ids, context=context):
            res[move.id] = 0.0
            total = 0.0
            if move.payment_ids:
                for payment in move.payment_ids:
                    if payment.credit:
                        total += payment.credit
            res[move.id] =  total
        return res
    def _compute_total_balance(self, cr, uid, ids, field, arg, context=None):
        res = {}
        for move in self.browse(cr, uid, ids, context=context):
            res[move.id] = 0.0
            total = 0.0
            if move.payment_ids:
                for payment in move.payment_ids:
                    if payment.credit:
                        total += payment.credit
            res[move.id] =  move.amount_total - total
        return res
    def _get_shop(self, cr, uid, ids, field, arg, context=None):
        res = {}
        sale_obj = self.pool.get('sale.order')
        for move in self.browse(cr, uid, ids, context=context):
            res[move.id] = False
            total = 0.0
            if move.origin:
                sale_ids = sale_obj.search(cr, uid, [('name', '=', move.origin)])
                if sale_ids:
                    sale_rec = sale_obj.browse(cr, uid, sale_ids[0])
                    res[move.id] =  sale_rec.warehouse_id.id
        return res
    _columns = {
        'total_paid': fields.function(_compute_total_paid, type='float', string='Total Paid'),
        'total_balance': fields.function(_compute_total_balance, type='float', string='Balance'),
        'shop_id': fields.function(_get_shop, type='many2one',relation='stock.warehouse', string='Shop', store=True),
    }

class sale_order(osv.osv):
    _inherit = 'sale.order'
    
    def _get_invoice_state(self, cr, uid, ids, field, arg, context=None):
        res = {}
        invoice_obj = self.pool.get('account.invoice')
        for move in self.browse(cr, uid, ids, context=context):
            res[move.id] = False
            if move.invoice_ids:
#                 unit_price = sale_line_obj.browse(cr, uid , move.sale_line_id.id).price_unit
                in_ids = []
                for invoice in move.invoice_ids:
                    in_ids.append(invoice.id)
                if invoice_obj.search(cr, uid, [('id', 'in', in_ids), ('state','=','paid')]):
                    res[move.id] =  'Paid'
                elif invoice_obj.search(cr, uid, [('id', 'in', in_ids), ('state','=','open')]):
                    res[move.id] =  'Open'
                else:
                    res[move.id] =  'Draft'
        return res
    def _compute_total_invoice(self, cr, uid, ids, field, arg, context=None):
        res = {}
        invoice_obj = self.pool.get('account.invoice')
        for move in self.browse(cr, uid, ids, context=context):
            res[move.id] = 0.0
            if move.invoice_ids:
                total =0.0
                for invoice in move.invoice_ids:
                    total += invoice.amount_total
                res[move.id] =  total
        return res
    _columns = {
        "invoice_state":fields.function(_get_invoice_state, type='char', size=32, string='Status', store=True),
        'total_invoice': fields.function(_compute_total_invoice, type='float', string='Total'),
    }