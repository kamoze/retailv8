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

from openerp import models, fields, api, _
import openerp.addons.decimal_precision as dp
from openerp import netsvc, tools
import time

class account_invoice(models.Model):
    _inherit = "account.invoice"

    @api.one
    @api.depends('invoice_line.price_subtotal', 'tax_line.amount')
    def _compute_amount(self):
        self.amount_untaxed = sum(line.price_subtotal for line in self.invoice_line)
        self.amount_tax = sum(line.amount for line in self.tax_line)
        self.amount_total = self.amount_untaxed + self.amount_tax - self.redeem_point_amt - self.gift_coupan_amt

    redeem_point_amt = fields.Float('Redeem Point Amt')
    gift_coupan_amt = fields.Float('Gift Coupon Amt')
    amount_untaxed = fields.Float(string='Subtotal', digits=dp.get_precision('Account'),
        store=True, readonly=True, compute='_compute_amount', track_visibility='always')
    amount_tax = fields.Float(string='Tax', digits=dp.get_precision('Account'),
        store=True, readonly=True, compute='_compute_amount')
    amount_total = fields.Float(string='Total', digits=dp.get_precision('Account'),
        store=True, readonly=True, compute='_compute_amount')

    @api.multi
    def finalize_invoice_move_lines(self, move_lines):
        move_lines = super(account_invoice, self).finalize_invoice_move_lines(move_lines)
        # This is compulsory to create account name="POS Discount"
        discount_account_id = self.env['account.account'].search([('name', 'ilike', 'POS Discount')])
        if not discount_account_id:
            return move_lines
        total_amount = 0.0
        for m in move_lines:
            if m[2]['credit'] > 0.0:
                total_amount += m[2]['credit']
        new_line = {
            'analytic_account_id': False,
            'tax_code_id': False,
            'analytic_lines': [],
            'tax_amount': False,
            'name': _('Global Discount'),
            'ref': '',
            'analytics_id': False,
            'currency_id': False,
            'debit': False,
            'product_id': False,
            'date_maturity': False,
            'credit': False,
            'date': move_lines[0][2]['date'],
            'amount_currency': 0,
            'product_uom_id': False,
            'quantity': 1,
            'partner_id': move_lines[0][2]['partner_id'],
            'account_id': discount_account_id[0].id,
        }
        if self.gift_coupan_amt > 0.00 or \
                        self.redeem_point_amt > 0.0:
            num_lines = 0
            for m in move_lines:
                if m[2]['debit'] > 0.0:
                    num_lines += 1
            discount_amount = (total_amount - self.amount_total)\
                                                                 / num_lines
            for m in move_lines:
                if m[2]['debit'] > 0.0:
                    m[2]['debit'] -= discount_amount
        precisione = self.env['decimal.precision'].precision_get('Account')
        debit = credit = 0.0
        for m in move_lines:
            m[2]['debit'] = round(m[2]['debit'], precisione)
            m[2]['credit'] = round(m[2]['credit'], precisione)
            debit += m[2]['debit']
            credit += m[2]['credit']
        precision_diff = round(credit - debit, precisione)
        if precision_diff != 0.0:
            if precision_diff < 0.0:
                new_line['credit'] = abs(precision_diff)
            else:
                new_line['debit'] = precision_diff
            move_lines += [(0, 0, new_line)]
        return move_lines
